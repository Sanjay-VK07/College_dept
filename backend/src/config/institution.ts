export interface InstitutionConfig {
  id: string;
  code: string;
  name: string;
  shortName: string;
  domain: string;
}

export const CURRENT_INSTITUTION: InstitutionConfig = {
  id: 'citchennai',
  code: 'CIT',
  name: 'Chennai Institute of Technology',
  shortName: 'CIT',
  domain: 'citchennai.net',
};
