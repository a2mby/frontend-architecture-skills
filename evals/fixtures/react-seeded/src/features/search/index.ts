import { addItem } from "../cart";
import { checkoutTotal } from "../checkout";
export const quickBuy = (id: string) => { addItem(id); return checkoutTotal(1); };
