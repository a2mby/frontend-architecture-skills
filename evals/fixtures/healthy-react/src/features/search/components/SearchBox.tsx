import { CartList } from "@/features/cart";
import { Button } from "@/shared/ui/Button";

export function SearchBox() {
  return <div><Button label="go" /><CartList items={[]} /></div>;
}
