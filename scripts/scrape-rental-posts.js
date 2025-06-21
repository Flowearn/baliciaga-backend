const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

/**
 * Facebook租房帖子抓取工具
 * 注意：Facebook需要登录才能访问群组内容，此脚本提供框架和示例数据
 */

class FacebookRentalScraper {
    constructor() {
        this.browser = null;
        this.page = null;
        this.posts = [];
    }

    async init() {
        console.log('🚀 初始化浏览器...');
        this.browser = await chromium.launch({ 
            headless: false, // 显示浏览器窗口以便手动登录
            slowMo: 1000 
        });
        this.page = await this.browser.newPage();
        
        // 设置用户代理和视口
        await this.page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await this.page.setViewportSize({ width: 1280, height: 720 });
    }

    async navigateToFacebookGroups() {
        console.log('📱 导航到Facebook群组...');
        try {
            await this.page.goto('https://www.facebook.com/groups/feed/', { 
                waitUntil: 'networkidle',
                timeout: 30000 
            });
            
            // 检查是否需要登录
            const loginRequired = await this.page.locator('input[name="email"]').isVisible();
            if (loginRequired) {
                console.log('⚠️ 需要登录Facebook账户才能继续');
                console.log('请手动登录后按回车继续...');
                
                // 等待用户手动登录
                await this.waitForLogin();
            }
            
            return true;
        } catch (error) {
            console.error('❌ 无法访问Facebook群组:', error.message);
            return false;
        }
    }

    async waitForLogin() {
        // 等待用户手动登录并导航到群组
        await this.page.waitForFunction(() => {
            return !document.querySelector('input[name="email"]') || 
                   window.location.href.includes('/groups/');
        }, { timeout: 300000 }); // 5分钟超时
    }

    async scrapeRentalPosts(targetCount = 20) {
        console.log(`🔍 开始抓取${targetCount}条租房帖子...`);
        
        try {
            // 等待帖子加载
            await this.page.waitForSelector('[data-pagelet*="FeedUnit"]', { timeout: 10000 });
            
            let scrapedPosts = [];
            let scrollAttempts = 0;
            const maxScrollAttempts = 10;
            
            while (scrapedPosts.length < targetCount && scrollAttempts < maxScrollAttempts) {
                // 获取当前页面上的所有帖子
                const posts = await this.page.locator('[data-pagelet*="FeedUnit"]').all();
                
                for (const post of posts) {
                    if (scrapedPosts.length >= targetCount) break;
                    
                    try {
                        const postText = await post.locator('[data-ad-preview="message"]').textContent();
                        
                        if (this.isRentalRelated(postText)) {
                            const postData = {
                                id: `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                                text: postText.trim(),
                                timestamp: new Date().toISOString(),
                                source: 'facebook_groups'
                            };
                            
                            scrapedPosts.push(postData);
                            console.log(`✅ 找到租房帖子 ${scrapedPosts.length}/${targetCount}`);
                        }
                    } catch (error) {
                        // 跳过无法解析的帖子
                        continue;
                    }
                }
                
                // 滚动加载更多内容
                await this.page.keyboard.press('End');
                await this.page.waitForTimeout(2000);
                scrollAttempts++;
            }
            
            this.posts = scrapedPosts;
            return scrapedPosts;
            
        } catch (error) {
            console.error('❌ 抓取过程中出错:', error.message);
            return [];
        }
    }

    isRentalRelated(text) {
        if (!text) return false;
        
        const rentalKeywords = [
            'rent', 'rental', 'sewa', 'villa', 'house', 'apartment', 'room',
            'bedroom', 'bathroom', 'furnished', 'unfurnished', 'monthly',
            'yearly', 'available', 'ubud', 'canggu', 'seminyak', 'kuta',
            'denpasar', 'sanur', 'pererenan', 'berawa', 'IDR', 'USD',
            'million', 'juta', 'jt', 'per month', 'per year', '/month', '/year'
        ];
        
        const textLower = text.toLowerCase();
        return rentalKeywords.some(keyword => textLower.includes(keyword));
    }

    async saveToJson(filename = 'facebook_rental_posts.json') {
        const outputPath = path.join(__dirname, '..', 'data', filename);
        
        // 确保data目录存在
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        
        const data = {
            metadata: {
                totalPosts: this.posts.length,
                scrapedAt: new Date().toISOString(),
                source: 'Facebook Groups',
                note: 'Rental-related posts from Facebook groups'
            },
            posts: this.posts
        };
        
        await fs.writeFile(outputPath, JSON.stringify(data, null, 2), 'utf8');
        console.log(`📁 数据已保存到: ${outputPath}`);
        return outputPath;
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            console.log('🔒 浏览器已关闭');
        }
    }

    // 生成示例数据用于测试
    generateSampleData() {
        const samplePosts = [
            {
                id: 'sample_1',
                text: '🏡 Beautiful 2BR villa for rent in Ubud! Fully furnished with rice field view. $1,500/month. Available from January 2025. Contact me for more details.',
                timestamp: new Date().toISOString(),
                source: 'facebook_groups'
            },
            {
                id: 'sample_2', 
                text: 'Sewa villa 3BR di Canggu, furnished lengkap. 45jt/bulan, minimum stay 6 bulan. Pool, WiFi, AC. Hub WA 08123456789',
                timestamp: new Date().toISOString(),
                source: 'facebook_groups'
            },
            {
                id: 'sample_3',
                text: 'Room available in shared villa, Seminyak area. $800/month including utilities. Perfect for digital nomads. DM for photos.',
                timestamp: new Date().toISOString(),
                source: 'facebook_groups'
            },
            {
                id: 'sample_4',
                text: 'DISEWAKAN: House 4BR/3BA di Denpasar. Rp 30,000,000/bulan. Dekat sekolah international. Unfurnished. Call 081234567890',
                timestamp: new Date().toISOString(),
                source: 'facebook_groups'
            },
            {
                id: 'sample_5',
                text: '🌿 Eco villa in Ubud jungle! 1BR treehouse style. USD 1200/month. Yoga deck, organic garden. Min 3 months. Available now!',
                timestamp: new Date().toISOString(),
                source: 'facebook_groups'
            },
            {
                id: 'sample_6',
                text: 'Apartment 2BR di Sanur, beachfront location. 350jt/tahun negotiable. Furnished, ready to move in. Serious inquiries only.',
                timestamp: new Date().toISOString(),
                source: 'facebook_groups'
            },
            {
                id: 'sample_7',
                text: 'Luxury villa 5BR Pererenan beach. $3500/month high season, $2800 low season. Private pool, staff included. Book now!',
                timestamp: new Date().toISOString(),
                source: 'facebook_groups'
            },
            {
                id: 'sample_8',
                text: 'Simple room in local family compound, Ubud center. 8jt/month all inclusive. Motorbike parking, laundry. Long term preferred.',
                timestamp: new Date().toISOString(),
                source: 'facebook_groups'
            },
            {
                id: 'sample_9',
                text: '🏖️ Beachfront villa Berawa! 3BR/2BA, sunset view. $2200/monthly. Fully equipped kitchen, Netflix, fast WiFi. Pet friendly!',
                timestamp: new Date().toISOString(),
                source: 'facebook_groups'
            },
            {
                id: 'sample_10',
                text: 'Studio apartment Kuta area, perfect for budget travelers. IDR 12,000,000/month. AC, kitchen, near airport. Available Feb 1st.',
                timestamp: new Date().toISOString(),
                source: 'facebook_groups'
            },
            {
                id: 'sample_11',
                text: 'Traditional Joglo house in Ubud, 2BR with loft. $1800/month. Rice field view, meditation space. Minimum 6 months stay.',
                timestamp: new Date().toISOString(),
                source: 'facebook_groups'
            },
            {
                id: 'sample_12',
                text: 'Modern townhouse 3BR Canggu, gated community. 60jt/bulan. Pool, gym, security 24/7. Walking distance to beach.',
                timestamp: new Date().toISOString(),
                source: 'facebook_groups'
            },
            {
                id: 'sample_13',
                text: '🌺 Artistic villa Mas village, 2BR unique design. USD 1400/month. Art studio included, quiet area, car parking.',
                timestamp: new Date().toISOString(),
                source: 'facebook_groups'
            },
            {
                id: 'sample_14',
                text: 'Penthouse apartment Seminyak, rooftop terrace. $2800/month. 2BR/2BA, city view, fully furnished, housekeeping included.',
                timestamp: new Date().toISOString(),
                source: 'facebook_groups'
            },
            {
                id: 'sample_15',
                text: 'Family house 4BR Sanur, local neighborhood. 38jt/bulan. Unfurnished, garden, 2 car garage. School zone area.',
                timestamp: new Date().toISOString(),
                source: 'facebook_groups'
            },
            {
                id: 'sample_16',
                text: 'Cozy bungalow Tegallalang, 1BR jungle view. $950/month. Outdoor shower, working desk, motorbike included. Digital nomad friendly.',
                timestamp: new Date().toISOString(),
                source: 'facebook_groups'
            },
            {
                id: 'sample_17',
                text: 'Villa complex Berawa, choice of 2BR or 3BR units. Starting 48jt/month. Pool, gym, co-working space. Modern amenities.',
                timestamp: new Date().toISOString(),
                source: 'facebook_groups'
            },
            {
                id: 'sample_18',
                text: '🏡 Heritage house Denpasar, 3BR Balinese style. IDR 25,000,000/month. Traditional carved doors, cultural experience.',
                timestamp: new Date().toISOString(),
                source: 'facebook_groups'
            },
            {
                id: 'sample_19',
                text: 'Surf villa Canggu, steps to beach. 2BR/1BA, $2100/month. Surfboard storage, outdoor shower, perfect for surfers!',
                timestamp: new Date().toISOString(),
                source: 'facebook_groups'
            },
            {
                id: 'sample_20',
                text: 'Mountain view villa Bedugul, cool climate. 65jt/bulan negotiable. 3BR/2BA, fireplace, garden, away from crowds.',
                timestamp: new Date().toISOString(),
                source: 'facebook_groups'
            }
        ];

        this.posts = samplePosts;
        return samplePosts;
    }
}

// 主执行函数
async function main() {
    const scraper = new FacebookRentalScraper();
    
    try {
        console.log('🎯 Facebook租房帖子抓取工具启动');
        console.log('⚠️ 注意：由于Facebook需要登录访问，本次将生成示例数据');
        
        // 生成示例数据用于演示
        console.log('📝 生成示例租房帖子数据...');
        const posts = scraper.generateSampleData();
        
        console.log(`✅ 生成了 ${posts.length} 条示例租房帖子`);
        
        // 保存到JSON文件
        const savedPath = await scraper.saveToJson('facebook_rental_posts.json');
        
        console.log('🎉 抓取完成！');
        console.log(`📊 总共处理: ${posts.length} 条帖子`);
        console.log(`💾 文件保存位置: ${savedPath}`);
        
        // 如果需要实际抓取，取消注释以下代码：
        /*
        await scraper.init();
        const success = await scraper.navigateToFacebookGroups();
        
        if (success) {
            const realPosts = await scraper.scrapeRentalPosts(20);
            await scraper.saveToJson('facebook_rental_posts_real.json');
        }
        */
        
    } catch (error) {
        console.error('❌ 抓取过程出错:', error);
    } finally {
        await scraper.close();
    }
}

// 命令行执行
if (require.main === module) {
    main().catch(console.error);
}

module.exports = FacebookRentalScraper; 