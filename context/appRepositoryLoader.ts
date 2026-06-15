// Lazy import AppStateRepository to avoid initialization issues during module load
// It will be imported when actually needed
let AppStateRepositoryClass: any = null;
let importPromise: Promise<any> | null = null;

export async function getAppStateRepository() {
    if (!AppStateRepositoryClass) {
        if (!importPromise) {
            importPromise = import('../services/legacy-sqlite/repositories/appStateRepository').then(module => {
                AppStateRepositoryClass = module.AppStateRepository;
                return AppStateRepositoryClass;
            }).catch(error => {
                console.error('❌ Failed to load AppStateRepository:', error);
                importPromise = null; // Reset so we can retry
                throw new Error(`Failed to load AppStateRepository: ${error instanceof Error ? error.message : String(error)}`);
            });
        }
        await importPromise;
    }
    return new AppStateRepositoryClass();
}
