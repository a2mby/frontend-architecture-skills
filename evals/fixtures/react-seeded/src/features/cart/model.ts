import { price } from "./internal/price";
export const total = (n: number): number => (n > 0 ? price(n - 1) : 0);
