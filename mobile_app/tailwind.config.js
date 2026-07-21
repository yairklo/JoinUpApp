/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
    presets: [require("nativewind/preset")],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                // Brand aligned with next_app MUI theme
                brand: {
                    DEFAULT: '#059669',
                    soft: '#10b981',
                    light: '#34d399',
                    pale: '#a7f3d0',
                    dark: '#047857',
                    ink: '#022c22',
                    mist: '#ecfdf5',
                },
                cyber: {
                    bg: '#0b1220',
                    card: '#111a2c',
                    border: '#1e293b',
                    text: '#f1f5f9',
                    muted: '#94a3b8',
                    accent: '#059669',
                    neon: '#34d399',
                },
            },
        },
    },
    plugins: [],
};
