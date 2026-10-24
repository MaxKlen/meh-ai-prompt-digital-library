export type PromptModality = "TEXT" | "IMAGE" | "VIDEO";

export type PromptCategory = {
  id: string;
  name: string;
  description: string;
};

export type PromptDataFile = {
  sourceId: string;
  file: string;
  records: number;
  bytes: number;
};

export type PromptSourceInfo = {
  id: string;
  name: string;
  organization: string;
  repository: string;
  revision: string;
  file: string;
  version: string;
  license: string;
  licenseUrl: string;
  attribution: string;
  canonicalUrl: string;
  platformCoverage: string[];
  coverageNote: string;
  recordsInSource: number;
  recordsIncluded: number;
  recordsExcludedForLicense: number;
  recordsExcludedByTitleMarkers: number;
  sha256: string;
};

export type PromptRecordSource = {
  sourceId: string;
  repository: string;
  revision: string;
  file: string;
  line: number;
  recordUrl: string;
  license: string;
  licenseUrl: string;
  attribution: string;
  contributor?: string;
};

export type PromptAlternate = {
  language: string;
  content: string;
};

export type PromptRecord = {
  id: string;
  title: string;
  categoryId: string;
  category: string;
  description: string;
  tags: string[];
  content: string;
  modality: PromptModality;
  sourceType: string;
  framework: string;
  difficulty: string;
  variables: string[];
  constraints: string[];
  intent: string;
  language: string | null;
  targetText: string[];
  alternates: PromptAlternate[];
  developerOriented: boolean;
  source: PromptRecordSource;
};

export type PromptLibrary = {
  title: string;
  generatedAt: string;
  dataPolicy: string;
  compatibilityNote: string;
  sources: PromptSourceInfo[];
  categories: PromptCategory[];
  prompts: PromptRecord[];
  sourceLicenseMarkersExcluded: Record<string, number>;
};

export type PromptLibraryManifest = Omit<PromptLibrary, "prompts"> & {
  dataFiles: PromptDataFile[];
  records: number;
};
