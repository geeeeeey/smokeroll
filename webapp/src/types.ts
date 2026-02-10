export type Product = {
  id: number;
  title: string;
  price: number;
  stock: number;
  imageUrl: string | null;
};

export type CartItem = { productId: number; qty: number };
