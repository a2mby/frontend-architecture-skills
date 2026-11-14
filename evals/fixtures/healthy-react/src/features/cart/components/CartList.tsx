import type { CartItem } from "../model";
import { Button } from "@/shared/ui/Button";

export function CartList({ items }: { items: CartItem[] }) {
  return <ul>{items.map((i) => <li key={i.id}>{i.qty} <Button label="remove" /></li>)}</ul>;
}
