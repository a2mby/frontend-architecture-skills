import { api } from "@/legacy/http/client";
import { fmt } from "@/legacy/util/format";

export const Orders = () => <p>{fmt(api("/orders"))}</p>;
