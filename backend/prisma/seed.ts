import "dotenv/config";
import { PrismaClient } from "@prisma/client";


const prisma = new PrismaClient();

async function main() {
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.product.deleteMany();

  await prisma.product.createMany({
    data: [
      { title: "Vape жидкость Монашки", price: 550, stock: 50, isActive: true },
      { title: "Vape Xross", price: 2500, stock: 5, isActive: true },
      { title: "Vape Pasito 2", price: 3200, stock: 6, isActive: true },
      { title: "Испаритель Pasito 0.6", price: 320, stock: 20, isActive: true },
      { title: "Картридж Xross", price: 320, stock: 20, isActive: true }
    ]
  });

  console.log("Seed done ✅");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
