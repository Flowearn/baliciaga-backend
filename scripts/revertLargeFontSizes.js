const fs = require('fs').promises;
const path = require('path');

// Revert font sizes that shouldn't have been changed (20px and above)
const revertMap = {
  // Revert back to original sizes
  'text-2xl': 'text-xl',   // 24px back to 20px
  'text-3xl': 'text-2xl',  // 30px back to 24px
  'text-4xl': 'text-3xl',  // 36px back to 30px
  'text-5xl': 'text-4xl',  // 48px back to 36px
};

async function revertFontSizesInFile(filePath) {
  try {
    let content = await fs.readFile(filePath, 'utf8');
    let hasChanges = false;

    // Create a single regex that matches all text size classes to revert
    const allSizes = Object.keys(revertMap).join('|');
    const regex = new RegExp(`\\b(${allSizes})\\b`, 'g');
    
    // Replace all matches using the map
    const updatedContent = content.replace(regex, (match) => {
      hasChanges = true;
      return revertMap[match] || match;
    });

    if (hasChanges) {
      await fs.writeFile(filePath, updatedContent, 'utf8');
      console.log(`✅ Reverted: ${filePath}`);
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
  let totalReverted = 0;

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      // Skip node_modules and other non-source directories
      if (!['node_modules', '.git', 'dist', 'build', '.next'].includes(entry.name)) {
        totalReverted += await processDirectory(fullPath);
      }
    } else if (entry.isFile() && (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts'))) {
      const reverted = await revertFontSizesInFile(fullPath);
      if (reverted) totalReverted++;
    }
  }
  
  return totalReverted;
}

async function main() {
  console.log('🔄 Reverting font sizes above 20px (text-xl)...\n');
  console.log('Revert mappings:');
  console.log('  text-2xl → text-xl');
  console.log('  text-3xl → text-2xl');
  console.log('  text-4xl → text-3xl');
  console.log('  text-5xl → text-4xl\n');
  
  const frontendDir = path.join(__dirname, '../../frontend/src');
  const totalReverted = await processDirectory(frontendDir);
  
  console.log(`\n✨ Complete! Reverted ${totalReverted} files.`);
}

main().catch(console.error);