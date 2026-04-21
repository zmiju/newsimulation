export type UserFunction =
  | 'STUDENT'
  | 'PM'
  | 'EMPLOYEE'
  | 'CEO_SM'
  | 'HR'
  | 'CEO_L'
  | 'UNIVERSITY'
  | 'OTHER';

export interface User {
  email: string;
  nick: string;
  function: UserFunction | string;
  termsAccepted?: boolean;
}

export interface HighScore {
  points: number;
  spi: number;
  cpi: number;
  level: number;
}
