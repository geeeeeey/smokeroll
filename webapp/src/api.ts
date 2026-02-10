import type { CartItem, Product } from "./types";

const API = import.meta.env.VITE_API_URL as string;

export async function getProducts(): Promise<Product[]> {
  const r = await fetch(`${API}/products`);
  if (!r.ok) throw new Error("Failed to load products");
  return r.json();
}

export async function createOrder(payload: {
  tgUserId: string;
  tgUsername?: string;
  items: CartItem[];
}) {
  const r = await fetch(`${API}/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
