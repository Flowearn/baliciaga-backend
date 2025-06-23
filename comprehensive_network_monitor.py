#!/usr/bin/env python3
"""
Comprehensive Network Monitor
Captures ALL network requests during category switching to identify the 5-second delay.
"""

import asyncio
import json
import time
from datetime import datetime
from playwright.async_api import async_playwright

class ComprehensiveNetworkMonitor:
    def __init__(self):
        self.all_requests = []
        self.api_requests = []
        self.slow_requests = []
        self.screenshots = []
        self.monitoring_active = False
        
    async def setup_browser(self):
        """Setup browser with comprehensive network monitoring"""
        self.playwright = await async_playwright().start()
        self.browser = await self.playwright.chromium.launch(
            headless=False,
            devtools=True,
            args=['--disable-web-security']
        )
        self.context = await self.browser.new_context(
            viewport={'width': 1920, 'height': 1080}
        )
        self.page = await self.context.new_page()
        
        # Track request start times
        self.request_start_times = {}
        
        # Set up comprehensive request/response monitoring
        self.page.on('request', self.on_request)
        self.page.on('response', self.on_response)
        self.page.on('requestfailed', self.on_request_failed)
        
    def on_request(self, request):
        """Track request start times"""
        if self.monitoring_active:
            self.request_start_times[request.url] = time.time()
            print(f"[REQUEST] {request.method} {request.url}")
            
    def on_response(self, response):
        """Track response times and analyze performance"""
        if not self.monitoring_active:
            return
            
        url = response.url
        end_time = time.time()
        start_time = self.request_start_times.get(url, end_time)
        duration_ms = (end_time - start_time) * 1000
        
        request_data = {
            'url': url,
            'method': response.request.method,
            'status': response.status,
            'duration_ms': duration_ms,
            'timestamp': end_time,
            'size': 0,  # Will try to get this
            'type': self.classify_request_type(url),
            'headers': dict(response.request.headers),
            'response_headers': dict(response.headers)
        }
        
        # Try to get response size
        try:
            content_length = response.headers.get('content-length')
            if content_length:
                request_data['size'] = int(content_length)
        except:
            pass
            
        self.all_requests.append(request_data)
        
        # Track API requests separately
        if self.is_api_request(url):
            self.api_requests.append(request_data)
            print(f"[API] {response.request.method} {url} - {response.status} - {duration_ms:.1f}ms")
            
        # Track slow requests
        if duration_ms > 1000:  # > 1 second
            self.slow_requests.append(request_data)
            print(f"[SLOW] {url} took {duration_ms:.1f}ms ({duration_ms/1000:.1f}s)")
            
    def on_request_failed(self, request):
        """Track failed requests"""
        if self.monitoring_active:
            print(f"[FAILED] {request.method} {request.url} - {request.failure}")
            
    def classify_request_type(self, url):
        """Classify the type of request"""
        if '/dev/places' in url or '/api/' in url:
            return 'API'
        elif any(ext in url for ext in ['.js', '.css']):
            return 'Asset'
        elif any(ext in url for ext in ['.png', '.jpg', '.gif', '.webp']):
            return 'Image'
        elif 'cloudfront.net' in url:
            return 'CDN'
        else:
            return 'Other'
            
    def is_api_request(self, url):
        """Check if this is an API request"""
        return '/dev/places' in url or '/api/' in url
        
    async def navigate_and_setup(self):
        """Navigate to the application and set up initial state"""
        print("🌐 Navigating to http://localhost:8084/...")
        await self.page.goto('http://localhost:8084/')
        
        # Wait for category tabs to load
        try:
            await self.page.wait_for_selector('text="Food"', timeout=15000)
            await self.page.wait_for_selector('text="Bar"', timeout=15000)
            print("✅ Category tabs loaded successfully")
        except Exception as e:
            print(f"⚠️ Warning: Could not find category tabs: {e}")
            
        # Take initial screenshot
        screenshot_initial = f"/tmp/comprehensive_initial_{int(time.time())}.png"
        await self.page.screenshot(path=screenshot_initial, full_page=True)
        self.screenshots.append(screenshot_initial)
        print(f"📸 Initial screenshot: {screenshot_initial}")
        
        # Wait for page to stabilize
        await asyncio.sleep(2)
        
    async def perform_category_switch_test(self):
        """Perform the category switch and monitor ALL network activity"""
        print("\n🔄 Starting Category Switch Test...")
        
        # Clear previous data
        self.all_requests.clear()
        self.api_requests.clear()
        self.slow_requests.clear()
        self.request_start_times.clear()
        
        # Start monitoring
        self.monitoring_active = True
        print("📡 Network monitoring ACTIVATED")
        
        # Take screenshot before switch
        screenshot_before = f"/tmp/comprehensive_before_{int(time.time())}.png"
        await self.page.screenshot(path=screenshot_before, full_page=True)
        self.screenshots.append(screenshot_before)
        
        # Record the exact moment we start the switch
        switch_start_time = time.time()
        print(f"⏱️ Category switch started at {datetime.fromtimestamp(switch_start_time)}")
        
        # Find and click the Bar tab
        try:
            bar_tab = await self.page.query_selector('text="Bar"')
            if bar_tab:
                print("🖱️ Clicking 'Bar' category tab...")
                await bar_tab.click()
            else:
                # Try alternative selectors
                print("🔍 Trying alternative tab selectors...")
                tabs = await self.page.query_selector_all('[role="tab"]')
                if len(tabs) > 1:
                    await tabs[1].click()  # Click second tab
                    print("🖱️ Clicked alternative tab")
                else:
                    raise Exception("No clickable tabs found")
                    
        except Exception as e:
            print(f"❌ Error clicking category tab: {e}")
            return False
            
        # Wait and monitor for network activity
        print("⏳ Monitoring network activity...")
        
        # Monitor for up to 10 seconds or until activity settles
        monitoring_duration = 0
        last_request_time = time.time()
        
        while monitoring_duration < 10:  # Maximum 10 seconds
            await asyncio.sleep(0.5)
            monitoring_duration += 0.5
            
            # Check if we have recent network activity
            current_time = time.time()
            if self.all_requests:
                latest_request = max(self.all_requests, key=lambda x: x['timestamp'])
                if current_time - latest_request['timestamp'] > 2:  # No activity for 2 seconds
                    print("📡 Network activity settled")
                    break
                    
        # Stop monitoring
        self.monitoring_active = False
        switch_end_time = time.time()
        total_switch_duration = (switch_end_time - switch_start_time) * 1000
        
        print(f"🏁 Category switch completed in {total_switch_duration:.1f}ms ({total_switch_duration/1000:.1f}s)")
        
        # Take screenshot after switch
        screenshot_after = f"/tmp/comprehensive_after_{int(time.time())}.png"
        await self.page.screenshot(path=screenshot_after, full_page=True)
        self.screenshots.append(screenshot_after)
        
        return True
        
    def analyze_comprehensive_results(self):
        """Comprehensive analysis of all captured network data"""
        print("\n" + "="*80)
        print("COMPREHENSIVE NETWORK ANALYSIS")
        print("="*80)
        
        total_requests = len(self.all_requests)
        api_requests_count = len(self.api_requests)
        slow_requests_count = len(self.slow_requests)
        
        print(f"📊 SUMMARY:")
        print(f"   Total Requests: {total_requests}")
        print(f"   API Requests: {api_requests_count}")
        print(f"   Slow Requests (>1s): {slow_requests_count}")
        
        if not self.all_requests:
            print("❌ No network requests were captured!")
            return
            
        # Analyze by request type
        print(f"\n📋 REQUESTS BY TYPE:")
        type_summary = {}
        for req in self.all_requests:
            req_type = req['type']
            if req_type not in type_summary:
                type_summary[req_type] = {'count': 0, 'total_duration': 0, 'avg_duration': 0}
            type_summary[req_type]['count'] += 1
            type_summary[req_type]['total_duration'] += req['duration_ms']
            
        for req_type, stats in type_summary.items():
            avg_duration = stats['total_duration'] / stats['count']
            print(f"   {req_type:8} | {stats['count']:3} requests | Avg: {avg_duration:.1f}ms")
            
        # Show API requests in detail
        if self.api_requests:
            print(f"\n🎯 API REQUESTS DETAILS:")
            for i, req in enumerate(self.api_requests, 1):
                duration_s = req['duration_ms'] / 1000
                print(f"   {i}. {req['method']} {req['url']}")
                print(f"      Status: {req['status']} | Duration: {req['duration_ms']:.1f}ms ({duration_s:.2f}s)")
                print(f"      Size: {req['size']} bytes")
                
        # Show slowest requests
        if self.slow_requests:
            print(f"\n🐌 SLOWEST REQUESTS (>1 second):")
            sorted_slow = sorted(self.slow_requests, key=lambda x: x['duration_ms'], reverse=True)
            for i, req in enumerate(sorted_slow, 1):
                duration_s = req['duration_ms'] / 1000
                print(f"   {i}. {req['type']} | {req['method']} {req['url']}")
                print(f"      Duration: {req['duration_ms']:.1f}ms ({duration_s:.2f}s)")
                print(f"      Status: {req['status']} | Size: {req['size']} bytes")
                print()
        else:
            print(f"\n✅ No requests took longer than 1 second")
            
        # Find the potential culprit for 5-second delay
        requests_over_3s = [req for req in self.all_requests if req['duration_ms'] > 3000]
        if requests_over_3s:
            print(f"\n🚨 CRITICAL: Found {len(requests_over_3s)} requests taking >3 seconds!")
            for req in requests_over_3s:
                duration_s = req['duration_ms'] / 1000
                print(f"   ⚠️ {req['url']} took {duration_s:.2f} seconds")
                print(f"      This could be causing the 5-second delay!")
        else:
            print(f"\n🤔 No individual requests >3 seconds found.")
            print(f"   The 5-second delay might be caused by:")
            print(f"   - Multiple requests adding up")
            print(f"   - Frontend processing time")
            print(f"   - Network latency accumulation")
            
        # Calculate total time for all API requests
        if self.api_requests:
            total_api_time = sum(req['duration_ms'] for req in self.api_requests)
            print(f"\n⏱️ CUMULATIVE API TIME: {total_api_time:.1f}ms ({total_api_time/1000:.2f}s)")
            
        return self.generate_final_report()
        
    def generate_final_report(self):
        """Generate comprehensive final report"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        report_file = f"/tmp/comprehensive_network_report_{timestamp}.json"
        
        # Find the slowest request
        slowest_request = None
        if self.all_requests:
            slowest_request = max(self.all_requests, key=lambda x: x['duration_ms'])
            
        report_data = {
            'timestamp': timestamp,
            'summary': {
                'total_requests': len(self.all_requests),
                'api_requests': len(self.api_requests),
                'slow_requests': len(self.slow_requests),
                'requests_over_3s': len([req for req in self.all_requests if req['duration_ms'] > 3000]),
                'total_api_duration_ms': sum(req['duration_ms'] for req in self.api_requests),
                'slowest_request': slowest_request
            },
            'all_requests': self.all_requests,
            'api_requests': self.api_requests,
            'slow_requests': self.slow_requests,
            'screenshots': self.screenshots
        }
        
        with open(report_file, 'w') as f:
            json.dump(report_data, f, indent=2, default=str)
            
        print(f"\n📄 Comprehensive report saved to: {report_file}")
        
        if self.screenshots:
            print(f"📸 Screenshots captured:")
            for screenshot in self.screenshots:
                print(f"   - {screenshot}")
                
        return report_file
        
    async def cleanup(self):
        """Clean up resources"""
        if hasattr(self, 'browser'):
            await self.browser.close()
        if hasattr(self, 'playwright'):
            await self.playwright.stop()
            
    async def run_comprehensive_analysis(self):
        """Run the complete comprehensive network analysis"""
        try:
            print("🚀 Starting Comprehensive Network Performance Analysis")
            print("This will identify the exact cause of the 5-second delay")
            print("="*60)
            
            await self.setup_browser()
            await self.navigate_and_setup()
            
            success = await self.perform_category_switch_test()
            
            if success:
                report_file = self.analyze_comprehensive_results()
                
                print(f"\n✅ Analysis completed successfully!")
                print(f"📊 Check the report for detailed findings: {report_file}")
                
                return report_file
            else:
                print("❌ Category switch test failed")
                return None
                
        except Exception as e:
            print(f"💥 Error during comprehensive analysis: {e}")
            import traceback
            traceback.print_exc()
            return None
        finally:
            await self.cleanup()

async def main():
    monitor = ComprehensiveNetworkMonitor()
    await monitor.run_comprehensive_analysis()

if __name__ == "__main__":
    asyncio.run(main())