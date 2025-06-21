const fs = require('fs').promises;
const path = require('path');

// Font size mappings
const fontSizeMap = {
  // First pass: add temporary markers to avoid double replacements
  'text-xs': 'text-sm-new',
  'text-sm': 'text-base-new',
  'text-base': 'text-lg-new',
  'text-lg': 'text-xl-new',
};

// Second pass: remove the markers
const cleanupMap = {
  'text-sm-new': 'text-sm',
  'text-base-new': 'text-base',
  'text-lg-new': 'text-lg',
  'text-xl-new': 'text-xl',
};

async function updateFontSizesInFile(filePath) {
  try {
    let content = await fs.readFile(filePath, 'utf8');
    let hasChanges = false;

    // First pass: replace with temporary markers
    for (const [oldSize, newSize] of Object.entries(fontSizeMap)) {
      const regex = new RegExp(`\\b${oldSize}\\b`, 'g');
      if (content.match(regex)) {
        content = content.replace(regex, newSize);
        hasChanges = true;
      }
    }

    // Second pass: clean up markers
    for (const [tempSize, finalSize] of Object.entries(cleanupMap)) {
      const regex = new RegExp(`\\b${tempSize}\\b`, 'g');
      content = content.replace(regex, finalSize);
    }

    if (hasChanges) {
      await fs.writeFile(filePath, content, 'utf8');
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
  console.log('🔄 Starting font size updates...\n');
  
  const frontendDir = path.join(__dirname, '../../frontend/src');
  const totalUpdated = await processDirectory(frontendDir);
  
  console.log(`\n✨ Complete! Updated ${totalUpdated} files.`);
}

main().catch(console.error);