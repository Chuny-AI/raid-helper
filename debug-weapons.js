require('./src/database/connection');
const { getAllWeapons, getWeaponCategories } = require('./src/services/weaponService');
const fs = require('fs');
const path = require('path');

async function debugWeapons() {
  try {
    console.log('=== DEBUGGING WEAPONS ===');

    // Test database weapons
    try {
      const dbWeapons = await getAllWeapons();
      console.log(`\n1. DATABASE WEAPONS: ${dbWeapons.length} found`);

      if (dbWeapons.length > 0) {
        const crossbowWeapons = dbWeapons.filter(w => w.category === 'crossbow');
        console.log(`   - Crossbow weapons in DB: ${crossbowWeapons.length}`);
        if (crossbowWeapons.length > 0) {
          console.log('   - First crossbow weapon:', crossbowWeapons[0]);
        }
      }
    } catch (error) {
      console.log('   - Database error:', error.message);
    }

    // Test JSON weapons
    console.log('\n2. JSON FILE WEAPONS:');
    const weaponsFilePath = path.join(__dirname, 'src/weapons/weapons.json');

    if (fs.existsSync(weaponsFilePath)) {
      const weaponsData = JSON.parse(fs.readFileSync(weaponsFilePath, 'utf8'));
      console.log('   - JSON file loaded successfully');

      const jsonWeapons = [];
      for (const [category, categoryData] of Object.entries(weaponsData.weapons)) {
        if (category === 'crossbow') {
          console.log(`   - Crossbow category found: ${categoryData.data.length} weapons`);
          console.log(`   - Display name: ${categoryData.displayName}`);
          console.log(`   - First weapon:`, categoryData.data[0]);

          // Convert to expected format
          for (const weaponData of categoryData.data) {
            jsonWeapons.push({
              emojiId: weaponData.emoji || weaponData.emojiId || `emoji_${category}_${weaponData.name.replace(/\s/g, '_')}`,
              name: weaponData.name,
              category: category,
              categoryDisplayName: categoryData.displayName,
              categoryDefaultEmoji: categoryData.defaultEmoji,
              isActive: true
            });
          }
        }
      }

      console.log(`   - Converted crossbow weapons: ${jsonWeapons.length}`);
      if (jsonWeapons.length > 0) {
        console.log('   - First converted weapon:', jsonWeapons[0]);
      }
    } else {
      console.log('   - JSON file not found at:', weaponsFilePath);
    }

  } catch (error) {
    console.error('Error in debugWeapons:', error);
  }

  process.exit();
}

setTimeout(debugWeapons, 2000);