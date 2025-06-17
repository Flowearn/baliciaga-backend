require('dotenv').config();
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand, BatchWriteCommand } = require("@aws-sdk/lib-dynamodb");
const { S3Client, ListObjectsV2Command, DeleteObjectsCommand } = require("@aws-sdk/client-s3");

const region = process.env.AWS_REGION || 'ap-southeast-1';
const stage = process.env.STAGE || 'dev';
const listingsTableName = process.env.LISTINGS_TABLE || `Baliciaga-Listings-${stage}`;
const applicationsTableName = process.env.APPLICATIONS_TABLE || `Baliciaga-Applications-${stage}`;
const listingImagesBucket = process.env.LISTING_IMAGES_BUCKET || `baliciaga-listing-images-${stage}`;

const dbClient = new DynamoDBClient({ region });
const docClient = DynamoDBDocumentClient.from(dbClient);
const s3Client = new S3Client({ region });

const deleteAllItemsInBatches = async (tableName, items, keyName) => {
    const deleteRequests = items.map(item => ({
        DeleteRequest: { Key: { [keyName]: item[keyName] } }
    }));

    for (let i = 0; i < deleteRequests.length; i += 25) {
        const batch = deleteRequests.slice(i, i + 25);
        const command = new BatchWriteCommand({
            RequestItems: { [tableName]: batch }
        });
        await docClient.send(command);
        console.log(`已删除 ${tableName} 中的 ${batch.length} 条记录`);
    }
};

const emptyS3Directory = async (bucket, prefix) => {
    try {
        const listParams = { Bucket: bucket, Prefix: prefix };
        const listedObjects = await s3Client.send(new ListObjectsV2Command(listParams));

        if (!listedObjects.Contents || listedObjects.Contents.length === 0) {
            console.log(`S3目录 ${prefix} 中没有找到文件`);
            return;
        }

        const deleteParams = {
            Bucket: bucket,
            Delete: { Objects: listedObjects.Contents.map(({ Key }) => ({ Key })) },
        };
        await s3Client.send(new DeleteObjectsCommand(deleteParams));
        console.log(`已删除S3目录 ${prefix} 中的 ${deleteParams.Delete.Objects.length} 个文件`);
    } catch (error) {
        if (error.name === 'NoSuchBucket') {
            console.log(`S3存储桶 ${bucket} 不存在，跳过图片删除`);
        } else {
            console.warn(`删除S3文件时出错: ${error.message}`);
        }
    }
};

async function resetData() {
    console.log("=== 开始数据清理 ===");
    console.log(`区域: ${region}`);
    console.log(`阶段: ${stage}`);
    console.log(`房源表: ${listingsTableName}`);
    console.log(`申请表: ${applicationsTableName}`);
    console.log(`图片存储桶: ${listingImagesBucket}`);
    console.log("");

    try {
        // 1. 扫描所有房源
        console.log("正在扫描现有房源...");
        const listings = (await docClient.send(new ScanCommand({ TableName: listingsTableName }))).Items;
        if (listings.length === 0) {
            console.log("没有找到房源数据，无需删除。");
            return;
        }
        console.log(`找到 ${listings.length} 个房源需要删除`);

        // 2. 对每个房源，删除相关数据
        for (const listing of listings) {
            console.log(`\n处理房源: ${listing.listingId}`);
            
            // 删除S3图片
            await emptyS3Directory(listingImagesBucket, `listings/${listing.listingId}/`);

            // 查找并删除申请记录
            const apps = (await docClient.send(new ScanCommand({ 
                TableName: applicationsTableName,
                FilterExpression: "listingId = :listingId",
                ExpressionAttributeValues: { ":listingId": listing.listingId }
            }))).Items;
            
            if (apps.length > 0) {
                console.log(`找到 ${apps.length} 个相关申请记录`);
                await deleteAllItemsInBatches(applicationsTableName, apps, 'applicationId');
            }
        }
        
        // 3. 删除所有房源
        console.log(`\n删除所有房源记录...`);
        await deleteAllItemsInBatches(listingsTableName, listings, 'listingId');

        console.log("\n=== 数据清理完成！ ===");
        console.log("建议运行以下命令验证清理结果：");
        console.log(`aws dynamodb scan --table-name ${listingsTableName} --region ${region}`);
        
    } catch (error) {
        console.error("数据清理过程中出错:", error);
        throw error;
    }
}

resetData().catch(error => {
    console.error("脚本执行失败:", error);
    process.exit(1);
}); 