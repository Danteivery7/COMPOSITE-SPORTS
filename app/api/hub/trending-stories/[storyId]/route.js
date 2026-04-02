import { NextResponse } from 'next/server';
import { getHubStoryDetail } from '@/src/lib/hub';

export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  const { storyId } = await params;

  try {
    const apiHref = _request.nextUrl.searchParams.get('apiHref') || '';
    const data = await getHubStoryDetail(storyId, apiHref);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        storyId,
        error: error.message,
      },
      { status: 404 },
    );
  }
}
