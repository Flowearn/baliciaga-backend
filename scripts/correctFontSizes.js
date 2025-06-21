const fs = require('fs').promises;
const path = require('path');

// Direct font size mappings - what we want to change
const fontSizeMap = {
  // Current -> Target
  'text-xs': 'text-sm',
  'text-sm': 'text-base',
  'text-base': 'text-lg',
  'text-lg': 'text-xl',
  'text-xl': 'text-2xl',
  'text-2xl': 'text-3xl',
  'text-3xl': 'text-4xl',
  'text-4xl': 'text-5xl',
};

async function updateFontSizesInFile(filePath) {
  try {
    let content = await fs.readFile(filePath, 'utf8');
    let hasChanges = false;

    // Create a single regex that matches all text size classes
    const allSizes = Object.keys(fontSizeMap).join('|');
    const regex = new RegExp(`\\b(${allSizes})\\b`, 'g');
    
    // Replace all matches using the map
    const updatedContent = content.replace(regex, (match) => {
      hasChanges = true;
      return fontSizeMap[match] || match;
    });

    if (hasChanges) {
      await fs.writeFile(filePath, updatedContent, 'utf8');
      console.log(`✅ Updated: ${filePath}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
    return false;
  }
}

async function processDirectory(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  let totalUpdated = 0;

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      // Skip node_modules and other non-source directories
      if (!['node_modules', '.git', 'dist', 'build', '.next'].includes(entry.name)) {
        totalUpdated += await processDirectory(fullPath);
      }
    } else if (entry.isFile() && (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts'))) {
      const updated = await updateFontSizesInFile(fullPath);
      if (updated) totalUpdated++;
    }
  }
  
  return totalUpdated;
}

async function main() {
  console.log('🔄 Correcting font sizes across the application...\n');
  console.log('Font size mappings:');
  console.log('  text-xs → text-sm (12px → 14px)');
  console.log('  text-sm → text-base (14px → 16px)');
  console.log('  text-base → text-lg (16px → 18px)');
  console.log('  text-lg → text-xl (18px → 20px)\n');
  
  const frontendDir = path.join(__dirname, '../../frontend/src');
  const totalUpdated = await processDirectory(frontendDir);
  
  console.log(`\n✨ Complete! Updated ${totalUpdated} files.`);
}

main().catch(console.error);