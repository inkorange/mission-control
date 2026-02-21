export interface EfficiencyScore {
  score: number; // 0-100
  deltaVUsed: number;
  deltaVOptimal: number;
  fuelWasted: number; // kg
}

export interface BudgetScore {
  score: number; // 0-100
  costSpent: number;
  budgetMax: number;
  percentUnderBudget: number;
}

export interface AccuracyScore {
  score: number; // 0-100
  orbitalDeviation: number; // meters from target
  inclinationError: number; // degrees
}

export interface ScoreBreakdown {
  efficiency: EfficiencyScore;
  budget: BudgetScore;
  accuracy: AccuracyScore;
  totalScore: number; // Average of three categories
  stars: 0 | 1 | 2 | 3;
}

export type StarRating = 0 | 1 | 2 | 3;
