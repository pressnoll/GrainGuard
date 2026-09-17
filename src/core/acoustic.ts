export type AcousticClassification = 'clean' | 'needs_review' | 'infested';

export const ACOUSTIC_THRESHOLD = 0.55;
export const ACOUSTIC_REVIEW_BAND = 0.15;
export const ACOUSTIC_CLEAN_MAX = ACOUSTIC_THRESHOLD - ACOUSTIC_REVIEW_BAND;
export const ACOUSTIC_INFESTED_MIN = ACOUSTIC_THRESHOLD + ACOUSTIC_REVIEW_BAND;

export const ACOUSTIC_CLASS_LABEL: Record<AcousticClassification, string> = {
  clean: 'Clean',
  needs_review: 'Needs review',
  infested: 'Infested',
};
