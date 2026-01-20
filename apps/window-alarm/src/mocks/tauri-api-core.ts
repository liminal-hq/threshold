export const invoke = async (cmd: string, args?: any) => {
    console.log(`[MOCK] invoke: ${cmd}`, args);
    if (cmd === 'plugin:theme-utils|get_material_you_colours') {
        return {
            colours: {
                system_accent1_600: '#ff0000', // Mock red
                system_neutral1_900: '#111111',
                system_neutral1_100: '#eeeeee',
                system_neutral1_50: '#ffffff',
                system_accent3_600: '#00ff00',
            }
        };
    }
    return null;
};

export const addPluginListener = async (plugin: string, event: string, cb: any) => {
    console.log(`[MOCK] addPluginListener: ${plugin} ${event}`);
    return () => {}; // Unlisten function
};

export const convertFileSrc = (filePath: string, protocol = 'asset') => {
    return `${protocol}://localhost/${filePath}`;
};
