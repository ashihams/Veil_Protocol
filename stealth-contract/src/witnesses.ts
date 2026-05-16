export type StealthPrivateState = {
  privateCounter: number;
};

export const createPrivateState = (value: number): StealthPrivateState => {
  return {
    privateCounter: value,
  };
};

export const witnesses = {};
