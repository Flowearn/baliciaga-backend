// migrate-places-to-prod.js

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, BatchWriteCommand } = require("@aws-sdk/lib-dynamodb");
const fs = require("fs/promises");
const path = require("path");

// 配置AWS客户端
const client = new DynamoDBClient({ region: "ap-southeast-1" });
const docClient = DynamoDBDocumentClient.from(client);

// 定义目标表名和源数据目录
const TARGET_TABLE = "baliciaga-places-prod";
const SOURCE_DATA_DIR = "./data-to-migrate"; // 我们假设JSON文件会放在这个目录下

// 定义要迁移的文件及其对应的 'type'
const SOURCES = [
    { fileName: "dining.prod.json", type: "dining" },
    { fileName: "bars.prod.json", type: "bar" },
    { fileName: "cafes.prod.json", type: "cafe" },
    { fileName: "coworking.prod.json", type: "coworking" }
    // 如果还有其他类别，请在这里添加
];

// 主函数
async function migrate() {
    console.log("🚀 Starting migration to 'baliciaga-places-prod'...");

    for (const source of SOURCES) {
        console.log(`\nProcessing ${source.fileName}...`);
        
        try {
            // 1. 读取JSON文件
            const filePath = path.join(SOURCE_DATA_DIR, source.fileName);
            const fileContent = await fs.readFile(filePath, "utf-8");
            const items = JSON.parse(fileContent);

            if (!Array.isArray(items) || items.length === 0) {
                console.log(`  - No items found in ${source.fileName}. Skipping.`);
                continue;
            }

            // 2. 为每个项目添加 'type' 字段
            const itemsToMigrate = items.map(item => ({
                ...item,
                type: source.type // 这是关键步骤！
            }));

            // 3. 分批写入DynamoDB
            const batchSize = 25; // DynamoDB BatchWriteCommand 的最大限制
            for (let i = 0; i < itemsToMigrate.length; i += batchSize) {
                const batch = itemsToMigrate.slice(i, i + batchSize);
                
                const putRequests = batch.map(item => ({
                    PutRequest: {
                        Item: item,
                    },
                }));

                const command = new BatchWriteCommand({
                    RequestItems: {
                        [TARGET_TABLE]: putRequests,
                    },
                });

                await docClient.send(command);
                console.log(`  - Migrated batch ${i / batchSize + 1} (${batch.length} items)`);
            }
            console.log(`✅ Successfully migrated all ${itemsToMigrate.length} items from ${source.fileName}.`);

        } catch (error) {
            if (error.code === 'ENOENT') {
                 console.warn(`  - WARNING: Source file not found: ${source.fileName}. Skipping.`);
            } else {
                console.error(`❌ Error processing ${source.fileName}:`, error);
            }
        }
    }

    console.log("\nMigration process finished! 🎉");
}

migrate();