import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    const requestUrl = new URL(request.url);
    const code = requestUrl.searchParams.get('code');
    const origin = requestUrl.origin;

    console.log('[Auth Callback] Starting callback, code exists:', !!code);

    if (code) {
        const cookieStore = await cookies();

        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() {
                        return cookieStore.getAll();
                    },
                    setAll(cookiesToSet) {
                        try {
                            cookiesToSet.forEach(({ name, value, options }) =>
                                cookieStore.set(name, value, options)
                            );
                        } catch {
                            // Ignore
                        }
                    },
                },
            }
        );

        const { data: { session }, error: sessionError } = await supabase.auth.exchangeCodeForSession(code);

        console.log('[Auth Callback] Session exchange - user:', session?.user?.email, 'error:', sessionError?.message);

        if (session?.user) {
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('username')
                .eq('id', session.user.id)
                .single();

            console.log('[Auth Callback] Profile check - username:', profile?.username, 'error:', profileError?.message);

            // If no profile exists OR username not set, redirect to onboarding
            if (profileError || !profile?.username) {
                console.log('[Auth Callback] Redirecting to onboarding');
                return NextResponse.redirect(`${origin}/onboarding`);
            }

            console.log('[Auth Callback] Redirecting to dashboard');
        } else {
            // No session - something went wrong, still try onboarding
            console.log('[Auth Callback] No session, redirecting to onboarding anyway');
            return NextResponse.redirect(`${origin}/onboarding`);
        }
    }

    return NextResponse.redirect(`${origin}/dashboard`);
}
