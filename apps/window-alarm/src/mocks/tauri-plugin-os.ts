export const platform = () => {
    const mockOs = import.meta.env.VITE_MOCK_OS || 'android';
    console.log(`[MOCK] platform: ${mockOs}`);
    return mockOs;
};
