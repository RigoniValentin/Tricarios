import mongoose from "mongoose";
import { getCategoryProductCounts } from "./src/controllers/categoryController";

async function testProductCountsEndpoint() {
  try {
    // Connect to MongoDB
    await mongoose.connect("mongodb://localhost:27017/TricariosMongoDB");
    console.log("Connected to MongoDB");

    // Mock request and response objects
    const mockReq: any = {
      query: {}, // Using default parameters
    };

    const mockRes: any = {
      json: (data: any) => {
        console.log("\n📊 Product Counts API Response:");
        console.log("Success:", data.success);
        console.log("UpdatedAt:", data.data?.updatedAt);

        if (data.data && data.data.counts) {
          console.log("\n🏷️  Category Counts:");
          const counts = data.data.counts;
          const totalProducts = Object.values(counts).reduce(
            (sum: number, count: any) => sum + count,
            0
          );

          console.log(
            `Total categories with counts: ${Object.keys(counts).length}`
          );
          console.log(`Total products across all categories: ${totalProducts}`);

          // Show top categories by product count
          const sortedCounts = Object.entries(counts)
            .sort(([, a], [, b]) => (b as number) - (a as number))
            .slice(0, 10);

          console.log("\n📈 Top 10 categories by product count:");
          sortedCounts.forEach(([categoryId, count], index) => {
            console.log(`${index + 1}. ${categoryId}: ${count} products`);
          });

          // Show categories with zero products
          const zeroProductCategories = Object.entries(counts).filter(
            ([, count]) => count === 0
          );
          console.log(
            `\n🔍 Categories with 0 products: ${zeroProductCategories.length}`
          );
        }
      },
      status: (code: number) => ({
        json: (data: any) => {
          console.log(`\n❌ Error response (${code}):`, data);
        },
      }),
    };

    // Test default configuration
    console.log("🧪 Testing default configuration (all params true)...");
    await getCategoryProductCounts(mockReq, mockRes);

    // Test with different parameters
    console.log("\n🧪 Testing with rollupParents=false...");
    const mockReq2: any = {
      query: { rollupParents: "false" },
    };

    const mockRes2: any = {
      json: (data: any) => {
        if (data.data && data.data.counts) {
          const totalProducts = Object.values(data.data.counts).reduce(
            (sum: number, count: any) => sum + count,
            0
          );
          console.log(`Total products (no rollup): ${totalProducts}`);
        }
      },
      status: (code: number) => ({
        json: (data: any) => {
          console.log(`❌ Error (${code}):`, data);
        },
      }),
    };

    await getCategoryProductCounts(mockReq2, mockRes2);

    await mongoose.connection.close();
    console.log("\n✅ Test completed");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

testProductCountsEndpoint();
