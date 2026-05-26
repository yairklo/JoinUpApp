/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
    presets: [require("nativewind/preset")],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                cyber: {
                    bg: '#0a0a0a',
                    card: '#171717',
                    border: '#262626',
                    text: '#f8fafc',
                    muted: '#a3a3a3',
                    accent: '#2563eb', // electric blue
                    neon: '#0ea5e9'
                }
            }
        },
    },
    plugins: [],
}
