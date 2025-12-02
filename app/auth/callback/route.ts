import { createClient, createAdminClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Auth Callback Handler for OAuth (Google)
 * 
 * Flow Logic:
 * 1. User clicks "Login with Google" → redirects to Google
 * 2. Google redirects back here with code
 * 3. Exchange code for session
 * 4. Check if user exists in profiles
 * 5. If exists → continue to app
 * 6. If new → redirect to onboarding
 * 7. Handle errors appropriately
 */
export async function GET(request: NextRequest) {
  try {
    const requestUrl = new URL(request.url);
    const code = requestUrl.searchParams.get("code");
    const origin = requestUrl.origin;
    const isRegisterFlow = requestUrl.searchParams.get("flow") === "register";

    // If no code, something went wrong
    if (!code) {
      return NextResponse.redirect(
        `${origin}/login?error=oauth_failed&message=${encodeURIComponent(
          "OAuth callback tidak valid"
        )}`
      );
    }

    // Create supabase client with proper cookie handling
    const supabase = await createClient();

    // Exchange code for session
    // This will automatically set cookies via the createClient's cookie handlers
    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    
    console.log("[OAuth Callback] Exchange result:", {
      hasUser: !!data?.user,
      hasSession: !!data?.session,
      error: exchangeError?.message,
    });

    if (exchangeError) {
      console.error("OAuth exchange error:", exchangeError);
      return NextResponse.redirect(
        `${origin}/login?error=oauth_exchange_failed&message=${encodeURIComponent(
          "Gagal memproses login Google"
        )}`
      );
    }

    const user = data.user;

    if (!user) {
      return NextResponse.redirect(
        `${origin}/login?error=no_user&message=${encodeURIComponent(
          "User tidak ditemukan"
        )}`
      );
    }

    // Check if profile exists in our database
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("user_id, full_name, registered_at, is_admin")
      .eq("user_id", user.id)
      .maybeSingle();

    console.log("[OAuth Callback] Flow:", isRegisterFlow ? "REGISTER" : "LOGIN");
    console.log("[OAuth Callback] Profile found:", !!profile);
    console.log("[OAuth Callback] Is admin:", profile?.is_admin);
    console.log("[OAuth Callback] Onboarding complete:", !!profile?.registered_at);

    // Case 1: LOGIN FLOW - User trying to login with Google
    if (!isRegisterFlow) {
      // ⭐ ADMIN CHECK: Block Google OAuth for admin accounts (LOGIN ONLY)
      if (profile?.is_admin) {
        // Admin attempting to login via Google OAuth - NOT ALLOWED
        await supabase.auth.signOut();
        
        return NextResponse.redirect(
          `${origin}/login?error=admin_oauth_blocked&message=${encodeURIComponent(
            "Admin hanya dapat login menggunakan email dan password. Google OAuth tidak diizinkan untuk admin."
          )}`
        );
      }
      // If profile doesn't exist, they need to register first
      if (!profile) {
        // Sign out the user since they don't have a profile
        await supabase.auth.signOut();
        
        return NextResponse.redirect(
          `${origin}/login?error=account_not_found&message=${encodeURIComponent(
            "Akun Google Anda belum terdaftar. Silakan lakukan registrasi terlebih dahulu."
          )}`
        );
      }

      // Profile exists, check if onboarding completed
      // CRITICAL: Middleware will handle redirect based on onboarding status
      // Just navigate to /cari-jodoh and let middleware check & redirect if needed
      console.log("[OAuth Callback] LOGIN: Redirecting to /cari-jodoh");
      
      // createClient() has already set cookies via exchangeCodeForSession
      // Just redirect - the cookies are in the response headers automatically
      return NextResponse.redirect(`${origin}/cari-jodoh`);
    }

    // Case 2: REGISTER FLOW - User trying to register with Google
    if (isRegisterFlow) {
      // If profile already exists and onboarding complete, redirect to app
      if (profile && profile.registered_at) {
        // User already fully registered, just login them
        console.log("[OAuth Callback] REGISTER: User already registered, redirecting to /cari-jodoh");
        return NextResponse.redirect(`${origin}/cari-jodoh`);
      }
      
      // If profile exists but onboarding incomplete, continue onboarding
      if (profile && !profile.registered_at) {
        console.log("[OAuth Callback] REGISTER: Onboarding incomplete, redirecting to /onboarding/verifikasi");
        return NextResponse.redirect(`${origin}/onboarding/verifikasi`);
      }

      // New user - CREATE profile NOW but with registered_at = NULL
      // This allows CV creation during onboarding (FK satisfied)
      // registered_at will be set when onboarding completes
      // Use admin client to bypass RLS
      const adminClient = createAdminClient();
      const { error: insertError } = await adminClient.from("profiles").insert({
        user_id: user.id,
        email: user.email!,
        full_name: user.user_metadata?.full_name || user.user_metadata?.name || "User",
        registered_at: null, // ⭐ NULL = onboarding incomplete
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      if (insertError) {
        console.error("Profile creation error:", insertError);
        await supabase.auth.signOut();
        
        return NextResponse.redirect(
          `${origin}/register?error=profile_creation_failed&message=${encodeURIComponent(
            "Gagal membuat profil. Silakan coba lagi."
          )}`
        );
      }

      // Profile created with registered_at = NULL, redirect to onboarding
      console.log("[OAuth Callback] REGISTER: New profile created, redirecting to /onboarding/verifikasi");
      return NextResponse.redirect(`${origin}/onboarding/verifikasi`);
    }

    // Fallback - shouldn't reach here
    return NextResponse.redirect(`${origin}/login`);
  } catch (error) {
    // Catch any unexpected errors
    console.error("Auth callback error:", error);
    const origin = request.url.split('/auth/callback')[0];
    return NextResponse.redirect(
      `${origin}/login?error=unexpected_error&message=${encodeURIComponent(
        "Terjadi kesalahan saat memproses login. Silakan coba lagi."
      )}`
    );
  }
}
