import { ENV } from '../../../config/env';
import { performance } from 'perf_hooks';

export class AIQueueError extends Error {
  public code: string;
  public status: number;

  constructor(code: string, message: string, status: number = 429) {
    super(message);
    this.name = 'AIQueueError';
    this.code = code;
    this.status = status;
  }
}

export interface EnqueueJobParams<T> {
  requestId: string;
  userId: string;
  conversationId?: string;
  role?: string;
  signal?: AbortSignal;
  onQueued?: (data: { position: number; queueSize: number }) => void;
  execute: () => Promise<T>;
}

interface QueuedJob<T = any> {
  requestId: string;
  userId: string;
  conversationId?: string;
  role?: string;
  createdAt: number;
  enqueuedAt: number;
  signal?: AbortSignal;
  onQueued?: (data: { position: number; queueSize: number }) => void;
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: any) => void;
  timeoutTimer?: NodeJS.Timeout;
}

export class AIInferenceQueue {
  private static activeJobs = new Map<string, QueuedJob>();
  private static waitingQueue: QueuedJob[] = [];
  private static isShuttingDown = false;

  private static activeCountPerUser = new Map<string, number>();
  private static queuedCountPerUser = new Map<string, number>();

  // Telemetry metrics
  private static totalCompleted = 0;
  private static totalCancelled = 0;
  private static totalTimedOut = 0;
  private static totalRejected = 0;
  private static totalWaitMsSum = 0;
  private static maxRecordedWaitMs = 0;

  /**
   * Enqueues an Ollama inference task with capacity controls, fairness limits, timeout, and cancellation.
   */
  public static enqueue<T>(params: EnqueueJobParams<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const { requestId, userId, conversationId, role, signal, onQueued, execute } = params;
      const now = Date.now();

      if (this.isShuttingDown) {
        this.totalRejected++;
        return reject(new AIQueueError('SERVER_SHUTDOWN', 'Server is shutting down. Request rejected.', 503));
      }

      const maxConcurrent = ENV.AI_MAX_CONCURRENT_INFERENCE || 1;
      const maxQueueSize = ENV.AI_MAX_QUEUE_SIZE || 10;
      const maxQueueWaitMs = ENV.AI_MAX_QUEUE_WAIT_MS || 120000;
      const maxActivePerUser = ENV.AI_MAX_ACTIVE_PER_USER || 1;
      const maxQueuedPerUser = ENV.AI_MAX_QUEUED_PER_USER || 2;

      const userActive = this.activeCountPerUser.get(userId) || 0;
      const userQueued = this.queuedCountPerUser.get(userId) || 0;

      // 1. Per-User Fairness Check
      if (userActive >= maxActivePerUser || userQueued >= maxQueuedPerUser) {
        this.totalRejected++;
        console.log(`[AI_QUEUE] job rejected per-user limit exceeded requestId=${requestId} userId=${userId}`);
        return reject(
          new AIQueueError(
            'AI_USER_LIMIT_EXCEEDED',
            'You already have an active or queued AI request in progress. Please wait for it to complete.',
            429
          )
        );
      }

      // 2. Queue Capacity Check
      if (this.waitingQueue.length >= maxQueueSize && this.activeJobs.size >= maxConcurrent) {
        this.totalRejected++;
        console.log(`[AI_QUEUE] job rejected queue full requestId=${requestId}`);
        return reject(
          new AIQueueError(
            'AI_QUEUE_FULL',
            'The AI service is currently busy. Please try again shortly.',
            503
          )
        );
      }

      const job: QueuedJob<T> = {
        requestId,
        userId,
        conversationId,
        role,
        createdAt: now,
        enqueuedAt: now,
        signal,
        onQueued,
        execute,
        resolve,
        reject,
      };

      // 3. Immediate Execution if Capacity Available
      if (this.activeJobs.size < maxConcurrent && this.waitingQueue.length === 0) {
        this.runJob(job);
        return;
      }

      // 4. Queue Job
      this.waitingQueue.push(job);
      this.queuedCountPerUser.set(userId, userQueued + 1);

      const position = this.waitingQueue.length;
      console.log(`[AI_QUEUE] job queued requestId=${requestId} position=${position} queueSize=${this.waitingQueue.length}`);

      if (onQueued) {
        try {
          onQueued({ position, queueSize: this.waitingQueue.length });
        } catch (e) {}
      }

      // 5. Setup Job Timeout Timer
      job.timeoutTimer = setTimeout(() => {
        this.handleJobTimeout(job.requestId);
      }, maxQueueWaitMs);

      // 6. Setup Waiting Cancellation Listener
      if (signal) {
        const onAbortWaiting = () => {
          if (job.timeoutTimer) clearTimeout(job.timeoutTimer);
          signal.removeEventListener('abort', onAbortWaiting);
          this.handleJobCancelWaiting(job.requestId);
        };
        signal.addEventListener('abort', onAbortWaiting);
      }
    });
  }

  /**
   * Broadcasts updated queue position notifications to all waiting jobs.
   */
  private static broadcastQueuePositions(): void {
    const queueSize = this.waitingQueue.length;
    this.waitingQueue.forEach((job, index) => {
      if (job.onQueued) {
        try {
          job.onQueued({ position: index + 1, queueSize });
        } catch (e) {}
      }
    });
  }

  /**
   * Runs an inference job and manages active concurrency slots.
   */
  private static async runJob(job: QueuedJob): Promise<void> {
    const now = Date.now();
    const waitTimeMs = now - job.enqueuedAt;
    this.totalWaitMsSum += waitTimeMs;
    if (waitTimeMs > this.maxRecordedWaitMs) {
      this.maxRecordedWaitMs = waitTimeMs;
    }

    if (job.timeoutTimer) {
      clearTimeout(job.timeoutTimer);
    }

    this.activeJobs.set(job.requestId, job);
    const userActive = this.activeCountPerUser.get(job.userId) || 0;
    this.activeCountPerUser.set(job.userId, userActive + 1);

    console.log(`[AI_QUEUE] job started requestId=${job.requestId} waitTime=${waitTimeMs}ms activeJobs=${this.activeJobs.size}`);

    try {
      const result = await job.execute();
      this.totalCompleted++;
      console.log(`[AI_QUEUE] job completed requestId=${job.requestId}`);
      job.resolve(result);
    } catch (err: any) {
      if (err.name === 'AbortError' || job.signal?.aborted) {
        this.totalCancelled++;
        console.log(`[AI_QUEUE] job cancelled during inference requestId=${job.requestId}`);
      } else {
        console.error(`[AI_QUEUE] job error requestId=${job.requestId}:`, err.message);
      }
      job.reject(err);
    } finally {
      this.activeJobs.delete(job.requestId);
      const currActive = this.activeCountPerUser.get(job.userId) || 1;
      if (currActive <= 1) {
        this.activeCountPerUser.delete(job.userId);
      } else {
        this.activeCountPerUser.set(job.userId, currActive - 1);
      }

      this.processNext();
    }
  }

  /**
   * Processes the next waiting job in FIFO order.
   */
  private static processNext(): void {
    const maxConcurrent = ENV.AI_MAX_CONCURRENT_INFERENCE || 1;

    while (this.activeJobs.size < maxConcurrent && this.waitingQueue.length > 0) {
      const nextJob = this.waitingQueue.shift();
      if (!nextJob) break;

      const userQueued = this.queuedCountPerUser.get(nextJob.userId) || 1;
      if (userQueued <= 1) {
        this.queuedCountPerUser.delete(nextJob.userId);
      } else {
        this.queuedCountPerUser.set(nextJob.userId, userQueued - 1);
      }

      this.broadcastQueuePositions();
      this.runJob(nextJob);
    }
  }

  /**
   * Removes a job from the waiting queue if it times out before starting.
   */
  private static handleJobTimeout(requestId: string): void {
    const index = this.waitingQueue.findIndex((j) => j.requestId === requestId);
    if (index !== -1) {
      const [job] = this.waitingQueue.splice(index, 1);
      const userQueued = this.queuedCountPerUser.get(job.userId) || 1;
      if (userQueued <= 1) {
        this.queuedCountPerUser.delete(job.userId);
      } else {
        this.queuedCountPerUser.set(job.userId, userQueued - 1);
      }

      this.totalTimedOut++;
      console.log(`[AI_QUEUE] job timed out requestId=${requestId}`);
      this.broadcastQueuePositions();

      job.reject(
        new AIQueueError(
          'AI_QUEUE_TIMEOUT',
          'The AI service is currently busy. Please try again.',
          504
        )
      );
    }
  }

  /**
   * Removes a job from the waiting queue if cancelled before execution begins.
   */
  private static handleJobCancelWaiting(requestId: string): void {
    const index = this.waitingQueue.findIndex((j) => j.requestId === requestId);
    if (index !== -1) {
      const [job] = this.waitingQueue.splice(index, 1);
      const userQueued = this.queuedCountPerUser.get(job.userId) || 1;
      if (userQueued <= 1) {
        this.queuedCountPerUser.delete(job.userId);
      } else {
        this.queuedCountPerUser.set(job.userId, userQueued - 1);
      }

      this.totalCancelled++;
      console.log(`[AI_QUEUE] job cancelled while waiting requestId=${requestId}`);
      this.broadcastQueuePositions();

      const abortErr = new Error('Request was aborted while waiting in queue.');
      abortErr.name = 'AbortError';
      job.reject(abortErr);
    }
  }

  /**
   * Telemetry stats for observability endpoints
   */
  public static getStats() {
    const totalProcessed = this.totalCompleted + this.totalCancelled + this.totalTimedOut;
    const averageQueueWaitMs = totalProcessed > 0 ? Math.round(this.totalWaitMsSum / totalProcessed) : 0;

    return {
      activeJobs: this.activeJobs.size,
      queuedJobs: this.waitingQueue.length,
      maxConcurrent: ENV.AI_MAX_CONCURRENT_INFERENCE || 1,
      maxQueueSize: ENV.AI_MAX_QUEUE_SIZE || 10,
      totalCompleted: this.totalCompleted,
      totalCancelled: this.totalCancelled,
      totalTimedOut: this.totalTimedOut,
      totalRejected: this.totalRejected,
      averageQueueWaitMs,
      maxQueueWaitMs: this.maxRecordedWaitMs,
    };
  }

  /**
   * Gracefully drains and cancels all active and waiting jobs on server shutdown.
   */
  public static handleShutdown(): void {
    this.isShuttingDown = true;
    console.log(`[AI_QUEUE] Executing graceful shutdown. Active=${this.activeJobs.size}, Waiting=${this.waitingQueue.length}`);

    // 1. Drain waiting queue
    while (this.waitingQueue.length > 0) {
      const job = this.waitingQueue.shift();
      if (job) {
        if (job.timeoutTimer) clearTimeout(job.timeoutTimer);
        job.reject(new AIQueueError('SERVER_SHUTDOWN', 'Server is shutting down', 503));
      }
    }

    // 2. Abort active jobs
    this.activeJobs.forEach((job) => {
      if (job.timeoutTimer) clearTimeout(job.timeoutTimer);
      const abortErr = new Error('Server shutting down during inference.');
      abortErr.name = 'AbortError';
      job.reject(abortErr);
    });

    this.activeJobs.clear();
    this.activeCountPerUser.clear();
    this.queuedCountPerUser.clear();
    console.log('[AI_QUEUE] Graceful shutdown completed cleanly.');
  }

  /**
   * Test helper to reset queue counters
   */
  public static resetStats(): void {
    this.isShuttingDown = false;
    this.totalCompleted = 0;
    this.totalCancelled = 0;
    this.totalTimedOut = 0;
    this.totalRejected = 0;
    this.totalWaitMsSum = 0;
    this.maxRecordedWaitMs = 0;
    this.waitingQueue = [];
    this.activeJobs.clear();
    this.activeCountPerUser.clear();
    this.queuedCountPerUser.clear();
  }
}
