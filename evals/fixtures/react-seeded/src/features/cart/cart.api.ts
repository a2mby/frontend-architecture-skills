export const addItem = (id: string) => fetch(`/api/cart/${id}`, { method: "POST" });
