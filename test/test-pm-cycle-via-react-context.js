/**
 * Test Script via React Context
 * 
 * This version attempts to access services through React context.
 * Works when React DevTools are available or context is exposed.
 */

(async function testViaReactContext() {
    console.log('🧪 Testing via React Context...\n');
    
    // Method 1: Try to find React Fiber
    const findReactFiber = () => {
        const allElements = document.querySelectorAll('*');
        for (let element of allElements) {
            const keys = Object.keys(element);
            const reactKey = keys.find(key => key.startsWith('__reactFiber') || key.startsWith('__reactInternalInstance'));
            if (reactKey) {
                return element[reactKey];
            }
        }
        return null;
    };
    
    const findReactComponent = (fiber, componentName) => {
        if (!fiber) return null;
        
        let current = fiber;
        for (let i = 0; i < 50; i++) { // Limit search depth
            if (current.memoizedState || current.stateNode) {
                const elementType = current.elementType || current.type;
                if (elementType && (
                    (typeof elementType === 'string' && elementType.includes(componentName)) ||
                    (typeof elementType === 'function' && elementType.name === componentName) ||
                    (typeof elementType === 'object' && elementType.displayName === componentName)
                )) {
                    return current.stateNode || current.memoizedState;
                }
            }
            current = current.return || current._debugOwner;
            if (!current) break;
        }
        return null;
    };
    
    try {
        // Try Method 1: React Fiber
        const fiber = findReactFiber();
        if (fiber) {
            console.log('✅ React Fiber found, attempting to access AppContext...');
            
            // Try to find AppProvider or AppContext
            const appContext = findReactComponent(fiber, 'AppProvider') || 
                              findReactComponent(fiber, 'AppContext') ||
                              findReactComponent(fiber, 'App');
            
            if (appContext) {
                console.log('✅ AppContext found!');
                console.log('State:', appContext);
            } else {
                console.log('⚠️ AppContext not found in React tree');
            }
        } else {
            console.log('⚠️ React Fiber not found');
        }
        
        // Method 2: Check for exposed window objects
        console.log('\n🔍 Checking for exposed window objects...');
        const windowKeys = Object.keys(window).filter(key => 
            key.includes('App') || 
            key.includes('State') || 
            key.includes('Database') ||
            key.includes('Context')
        );
        
        if (windowKeys.length > 0) {
            console.log('Found window properties:', windowKeys);
            windowKeys.forEach(key => {
                console.log(`  ${key}:`, typeof window[key]);
            });
        } else {
            console.log('⚠️ No relevant window objects found');
        }
        
        // Method 3: Check localStorage for state
        console.log('\n🔍 Checking localStorage...');
        const stateKey = localStorage.getItem('finance_app_state_v4');
        if (stateKey) {
            try {
                const state = JSON.parse(stateKey);
                console.log('✅ State found in localStorage');
                console.log('Keys:', Object.keys(state));
                if (state.pmCycleAllocations) {
                    console.log('✅ pmCycleAllocations found:', state.pmCycleAllocations.length, 'items');
                }
            } catch (e) {
                console.log('⚠️ Could not parse state from localStorage');
            }
        }
        
        console.log('\n💡 Tip: Install React DevTools extension for better debugging');
        console.log('   https://chrome.google.com/webstore/detail/react-developer-tools/');
        
    } catch (error) {
        console.error('❌ Error:', error);
    }
})();
