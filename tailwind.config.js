/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ["class"],
    content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
    safelist: [
      'bg-blue-100', 'text-blue-700', 'border-blue-200', 'bg-blue-50', 'text-blue-600',
      'bg-amber-100', 'text-amber-700', 'border-amber-200', 'bg-amber-50', 'text-amber-600',
      'bg-red-100', 'text-red-700', 'border-red-200', 'bg-red-50', 'text-red-600',
      'bg-purple-100', 'text-purple-700', 'border-purple-200', 'bg-purple-50', 'text-purple-600',
      'bg-emerald-100', 'text-emerald-700', 'border-emerald-200', 'bg-emerald-50', 'text-emerald-600',
      'bg-cyan-100', 'text-cyan-700', 'border-cyan-200',
      'bg-gray-100', 'text-gray-600', 'border-gray-200', 'bg-gray-50',
      'bg-green-50', 'text-green-600',
      'bg-rose-50', 'text-rose-700', 'border-rose-200', 'bg-rose-100', 'text-rose-600',
      'bg-orange-50', 'text-orange-700', 'border-orange-200', 'bg-orange-100', 'text-orange-600',
      'bg-yellow-50', 'text-yellow-700', 'border-yellow-200', 'bg-yellow-100', 'text-yellow-600',
      'bg-stone-50', 'text-stone-700', 'border-stone-200', 'bg-stone-100', 'text-stone-600',
      'bg-violet-50', 'text-violet-700', 'border-violet-200', 'bg-violet-100', 'text-violet-600',
      'bg-teal-50', 'text-teal-700', 'border-teal-200', 'bg-teal-100', 'text-teal-600',
    ],
  theme: {
  	extend: {
  		fontFamily: {
  			heebo: ['var(--font-body)'],
  			headings: ['var(--font-headings)'],
  			body: ['var(--font-body)'],
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		colors: {
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			},
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-background))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))'
  			}
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
}