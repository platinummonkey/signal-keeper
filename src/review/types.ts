export type ReviewCategory = 'auto-merge' | 'needs-attention' | 'needs-changes' | 'block';

export interface SuggestedChange {
  file: string;
  description: string;
  suggestion: string;
}

export interface ReviewOutput {
  category: ReviewCategory;
  summary: string;
  notes: string[];
  suggestedChanges: SuggestedChange[];
  confidence: number;
}

export const REVIEW_JSON_SCHEMA = {
  type: 'object',
  required: ['category', 'summary', 'notes', 'suggestedChanges', 'confidence'],
  properties: {
    category: {
      type: 'string',
      enum: ['auto-merge', 'needs-attention', 'needs-changes', 'block'],
      description: 'Overall assessment category',
    },
    summary: {
      type: 'string',
      description: 'Concise 1-3 sentence summary of the PR and review decision',
    },
    notes: {
      type: 'array',
      items: { type: 'string' },
      description: 'Specific findings, concerns, or positive observations',
    },
    suggestedChanges: {
      type: 'array',
      items: {
        type: 'object',
        required: ['file', 'description', 'suggestion'],
        properties: {
          file: { type: 'string' },
          description: { type: 'string' },
          suggestion: { type: 'string' },
        },
      },
      description: 'Concrete code changes that should be made',
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Confidence in the review (0-1)',
    },
  },
  additionalProperties: false,
} as const;
