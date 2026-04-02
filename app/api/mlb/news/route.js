import { fetchMLBNews } from '@/src/mlb/lib/news';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        return NextResponse.json(await fetchMLBNews());
    } catch (error) {
        console.error('MLB news API error:', error);
        return NextResponse.json(
            {
                articles: [],
                error: error.message,
                lastUpdated: null,
            },
            { status: 500 }
        );
    }
}
