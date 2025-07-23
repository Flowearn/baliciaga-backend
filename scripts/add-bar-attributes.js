#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');

// Bar attributes data
const barAttributesData = {
  "ChIJN5xTyos50i0RiGBQWrCPinA": { // Honeycomb Hookah & Eatery
    "barType": ["Hookah Lounge & Restaurant"],
    "drinkFocus": ["Hookah", "Cocktails"],
    "atmosphere": ["Chic", "Cozy", "Stylish", "Relaxing"],
    "priceRange": "IDR 200k - 400k",
    "signatureDrinks": ["Weekend 2-for-1 Cocktails", "Extensive selection of hookah flavors"]
  },
  "ChIJk4MaNPo50i0R4vfuHDwZ_3U": { // LONGTIME
    "barType": ["Modern Asian Restaurant & Bar"],
    "drinkFocus": ["Cocktails", "Wine"],
    "atmosphere": ["Retro", "Stylish", "Vibrant", "Moody", "DJ Nights"],
    "priceRange": "IDR 400k - 800k+",
    "signatureDrinks": ["Signature cocktails", "Extensive wine list"]
  },
  "ChIJkYxdu3E50i0RrFJjPHk8LqI": { // PLATONIC
    "barType": ["Cocktail Bar / Speakeasy"],
    "drinkFocus": ["Craft Cocktails"],
    "atmosphere": ["Vintage", "Cozy", "Hidden", "Party Vibe"],
    "priceRange": "IDR 150k - 300k",
    "signatureDrinks": ["Hot Girl Summer", "Plan B", "Miami Coco White", "Adults Only"]
  },
  "ChIJOwB4D8E50i0RnmcWbm5B1jI": { // The Shady Fox
    "barType": ["Speakeasy Cocktail Parlour"],
    "drinkFocus": ["Craft Cocktails", "House-distilled spirits"],
    "atmosphere": ["Theatrical", "Vintage", "Lavish", "Live Jazz"],
    "priceRange": "IDR 200k - 400k",
    "signatureDrinks": ["Dern Kala", "Shogi Ice Tea", "Porn Star", "The Chester Cup"]
  },
  "ChIJgfLsf1pF0i0RTDMRSpGD_Zs": { // Bali Beer Cycle
    "barType": ["Mobile Bar / Party Bus"],
    "drinkFocus": ["Beer", "Pre-mixed drinks"],
    "atmosphere": ["Fun", "Social", "Sightseeing", "Party"],
    "priceRange": "IDR 600k (Alcohol Package)",
    "signatureDrinks": ["Unlimited Bintang", "Unlimited Smirnoff"]
  },
  "ChIJYcKvqiJH0i0RtzWDiRmCnI0": { // Miss Fish Bali
    "barType": ["Japanese Fusion Restaurant & Club"],
    "drinkFocus": ["Signature Cocktails", "High-end Spirits"],
    "atmosphere": ["Chic", "Delicate (Dining)", "High-Energy", "Fiery (Club)"],
    "priceRange": "IDR 400k - 1,000k+",
    "signatureDrinks": ["KITSUNE (Bourbon, Butterscotch)", "TAKAYUKI (Rum, Mezcal, Pineapple)", "I NO NAKA (Tequila, Port, Amareto)"]
  }
};

async function addBarAttributes(environment = 'dev') {
  try {
    // Read the current bars json based on environment
    const barsPath = path.join(__dirname, `bars-${environment}.json`);
    const barsData = JSON.parse(await fs.readFile(barsPath, 'utf-8'));
    
    console.log(`Processing ${barsData.length} bars...`);
    
    // Add attributes to bars that have matching placeIds
    let updatedCount = 0;
    barsData.forEach(bar => {
      if (barAttributesData[bar.placeId]) {
        Object.assign(bar, barAttributesData[bar.placeId]);
        updatedCount++;
        console.log(`Updated ${bar.name} with bar attributes`);
      }
    });
    
    // Write the updated data back
    await fs.writeFile(barsPath, JSON.stringify(barsData, null, 2));
    
    console.log(`\nSuccessfully updated ${updatedCount} bars with attributes`);
    console.log(`Updated file: ${barsPath}`);
    
  } catch (error) {
    console.error('Error updating bar attributes:', error);
    process.exit(1);
  }
}

// Run the script with environment from command line argument
const environment = process.argv[2] || 'dev';
console.log(`Adding bar attributes to ${environment} environment...`);
addBarAttributes(environment);