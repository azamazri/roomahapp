// app/api/auth/login/route.ts
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

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

    // Check if user is admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("user_id", data.user.id)
      .maybeSingle();

    if (profile?.is_admin) {
      console.log("[LOGIN API] Admin login successful");
    }

    // ✅ Route Handler automatically sets cookies via Set-Cookie headers!
    // The createClient() from lib/supabase/server.ts will handle cookie setting
    console.log("[LOGIN API] Login successful, returning response");
    
    return NextResponse.json(
      { 
        success: true,
        user: {
          id: data.user.id,
          email: data.user.email,
        }
      },
      { status: 200 }
    );

  } catch (error: any) {
    console.error("[LOGIN API] Unexpected error:", error);
    return NextResponse.json(
      { success: false, error: "Terjadi kesalahan server" },
      { status: 500 }
    );
  }
}