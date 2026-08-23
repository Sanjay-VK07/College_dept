import { OllamaProvider } from '../services/ollamaProvider';

describe('Ollama Runtime Health & Model Availability Tests', () => {
  it('should run health check against local Ollama instance and accurately return model availability', async () => {
    const ollama = new OllamaProvider('llama3.2');
    const health = await ollama.healthCheck();

    expect(health).toBeDefined();
    expect(typeof health.serverReachable).toBe('boolean');
    expect(typeof health.chatModelAvailable).toBe('boolean');
    expect(typeof health.embeddingModelAvailable).toBe('boolean');

    if (health.serverReachable && health.chatModelAvailable && health.embeddingModelAvailable) {
      expect(health.ok).toBe(true);
    } else {
      expect(health.ok).toBe(false);
    }
  });

  it('should return UNAVAILABLE for a non-existent model name', async () => {
    const ollama = new OllamaProvider('non_existent_model_xyz_999');
    const health = await ollama.healthCheck();

    expect(health.chatModelAvailable).toBe(false);
    expect(health.ok).toBe(false);
  });
});
