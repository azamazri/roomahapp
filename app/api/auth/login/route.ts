// app/api/auth/login/route.ts
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: "Email dan password harus diisi" },
        { status: 400 }
      );
    }

    console.log("[LOGIN API] Attempting login for:", email);

    // Create server-side Supabase client
    const supabase = await createClient();

    // Attempt sign in
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error("[LOGIN API] Sign in error:", error.message);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401 }
      );
    }

    if (!data.session) {
      console.error("[LOGIN API] No session created");
      return NextResponse.json(
        { success: false, error: "Gagal membuat session" },
        { status: 401 }
      );
    }

    console.log("[LOGIN API] Session created for user:", data.user.id);
    console.log("[LOGIN API] Session details:", {
      hasAccessToken: !!data.session.access_token,
      hasRefreshToken: !!data.session.refresh_token,
      expiresIn: data.session.expires_in,
      expiresAt: data.session.expires_at,
    });
    
    // CRITICAL: Verify Supabase actually set cookies
    // signInWithPassword should trigger setAll() callback in createClient()
    console.log("[LOGIN API] Waiting for Supabase to set cookies...");

    // Check if user is admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("user_id", data.user.id)
      .maybeSingle();

    if (profile?.is_admin) {
      console.log("[LOGIN API] Admin login successful");
    }

    console.log("[LOGIN API] Login successful, returning response");
    
    // CRITICAL FIX: Get cookies from Next.js cookies() store
    // and explicitly set them in Response headers
    const cookieStore = await cookies();
    const allCookies = cookieStore.getAll();
    const supabaseCookies = allCookies.filter(c => c.name.startsWith('sb-'));
    
    console.log("[LOGIN API] Cookies in store after login:", {
      total: allCookies.length,
      supabase: supabaseCookies.length,
      names: supabaseCookies.map(c => ({ name: c.name, valueLength: c.value.length })),
    });
    
    // CRITICAL: Check if refresh token cookie exists
    const hasAuthToken = supabaseCookies.some(c => c.name.includes('auth-token') && !c.name.includes('code-verifier'));
    const hasRefreshToken = supabaseCookies.some(c => c.name.includes('code-verifier'));
    
    console.log("[LOGIN API] Cookie check:", {
      hasAuthToken,
      hasRefreshToken,
      WARNING: !hasRefreshToken ? 'REFRESH TOKEN MISSING!' : 'OK',
    });
    
    // Create response
    const response = NextResponse.json(
      { 
        success: true,
        user: {
          id: data.user.id,
          email: data.user.email,
        }
      },
      { status: 200 }
    );

    // CRITICAL: Explicitly set ALL Supabase cookies in Response headers
    const isProduction = process.env.NODE_ENV === 'production';
    console.log("[LOGIN API] Setting cookies in response, environment:", { isProduction });
    
    supabaseCookies.forEach(cookie => {
      const cookieOptions = {
        path: '/',
        secure: isProduction,
        httpOnly: false, // Supabase needs client access
        sameSite: 'lax' as const,
        maxAge: 34560000, // 400 days (Supabase default)
      };
      
      console.log("[LOGIN API] Setting cookie in response:", {
        name: cookie.name,
        valueLength: cookie.value.length,
        options: cookieOptions,
      });
      
      response.cookies.set(cookie.name, cookie.value, cookieOptions);
    });
    
    console.log("[LOGIN API] Response cookies set:", response.cookies.getAll().length);
    
    return response;

  } catch (error: any) {
    console.error("[LOGIN API] Unexpected error:", error);
    return NextResponse.json(
      { success: false, error: "Terjadi kesalahan server" },
      { status: 500 }
    );
  }
}