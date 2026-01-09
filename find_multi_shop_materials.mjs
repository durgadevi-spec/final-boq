import pg from 'pg';

const pool = new pg.Pool({
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  database: process.env.DATABASE_NAME || 'boq',
  user: process.env.DATABASE_USER || 'boq_user',
  password: process.env.DATABASE_PASSWORD || 'boq_password',
});

async function findMultiShopMaterials() {
  try {
    // Get all materials with their shop info
    const result = await pool.query(`
      SELECT 
        m.code,
        m.name,
        m.rate,
        s.name as shop_name,
        COUNT(*) OVER (PARTITION BY m.code) as shop_count
      FROM materials m
      LEFT JOIN shops s ON m.shop_id = s.id
      WHERE m.approved IS TRUE
      ORDER BY m.code, m.rate ASC
    `);

    const materials = result.rows;
    const grouped = {};

    // Group by material code
    materials.forEach(mat => {
      if (!grouped[mat.code]) {
        grouped[mat.code] = [];
      }
      grouped[mat.code].push({
        name: mat.name,
        shop: mat.shop_name,
        rate: mat.rate,
        total_shops: mat.shop_count
      });
    });

    console.log('\n=== MATERIALS AVAILABLE IN MULTIPLE SHOPS ===\n');

    // Show only materials with multiple shops
    Object.entries(grouped).forEach(([code, shops]) => {
      if (shops.length > 1) {
        console.log(`📌 CODE: ${code}`);
        console.log(`   NAME: ${shops[0].name}`);
        console.log(`   AVAILABLE IN ${shops.length} SHOPS:`);
        shops.forEach(shop => {
          console.log(`     • ${shop.shop} - ₹${shop.rate}/unit`);
        });
        console.log();
      }
    });

    console.log('\n=== SUMMARY ===');
    const multiShop = Object.values(grouped).filter(shops => shops.length > 1);
    console.log(`Total materials with multiple shop options: ${multiShop.length}`);
    console.log(`Total unique materials: ${Object.keys(grouped).length}`);

    await pool.end();
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

findMultiShopMaterials();
