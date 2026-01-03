import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const { url } = await request.json();

        if (!url) {
            return NextResponse.json({ error: 'URL required' }, { status: 400 });
        }

        // specific headers to look like a browser
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
            },
            next: { revalidate: 3600 } // cache for 1 hour
        });

        if (!response.ok) {
            return NextResponse.json({ error: 'Failed to fetch' }, { status: 404 });
        }

        const html = await response.text();

        // Simple verification of og:image tag
        // <meta property="og:image" content="...">
        const match = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);

        if (match && match[1]) {
            return NextResponse.json({ imageUrl: match[1] });
        }

        // Try twitter:image
        const twitterMatch = html.match(/<meta\s+name=["']twitter:image["']\s+content=["']([^"']+)["']/i);
        if (twitterMatch && twitterMatch[1]) {
            return NextResponse.json({ imageUrl: twitterMatch[1] });
        }

        return NextResponse.json({ error: 'No image found' }, { status: 404 });
    } catch (error) {
        return NextResponse.json({ error: 'Server Error' }, { status: 500 });
    }
}
