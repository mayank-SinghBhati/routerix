import { NextRequest, NextResponse } from "next/server";
import {
  authenticateUser,
  changePassword,
  createSession,
  createUser,
  deleteSession,
  deleteTripById,
  finishPasswordReset,
  getSessionUser,
  getStatsForUser,
  getTripResult,
  listTrips,
  resolveCorridor,
  liveTrafficAvailable,
  runSimulation,
  saveTrip,
  SCENARIOS,
  startPasswordReset,
  updateProfile,
  type Scenario,
} from "@/lib/server/backend";

const COOKIE = "routerix_session";

function requireUser(req: NextRequest) {
  const token = req.cookies.get(COOKIE)?.value;
  const user = getSessionUser(token);
  if (!user) {
    return { error: NextResponse.json({ detail: "Not signed in" }, { status: 401 }), user: null };
  }
  return { error: null, user };
}

function withSessionCookie(res: NextResponse, token: string) {
  res.cookies.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 86400,
  });
  return res;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params;
  const route = "/" + path.join("/");

  if (route === "/config") {
    return NextResponse.json({
      live_traffic: liveTrafficAvailable(),
      email: Boolean(process.env.SMTP_HOST),
      scenarios: Object.keys(SCENARIOS),
    });
  }

  if (route === "/me") {
    const { error, user } = requireUser(req);
    if (error) return error;
    return NextResponse.json(user);
  }

  if (route === "/stats") {
    const { error, user } = requireUser(req);
    if (error) return error;
    return NextResponse.json(getStatsForUser(user.id));
  }

  if (route === "/trips") {
    const { error, user } = requireUser(req);
    if (error) return error;
    const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get("limit") ?? 50), 1), 200);
    const offset = Math.max(Number(req.nextUrl.searchParams.get("offset") ?? 0), 0);
    return NextResponse.json(listTrips(user.id, limit, offset));
  }

  if (path[0] === "trips" && path.length === 2) {
    const { error, user } = requireUser(req);
    if (error) return error;
    const tripId = Number(path[1]);
    const result = getTripResult(user.id, tripId);
    if (!result) {
      return NextResponse.json({ detail: "Trip not found" }, { status: 404 });
    }
    return NextResponse.json(result);
  }

  return NextResponse.json({ detail: "Not found" }, { status: 404 });
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params;
  const route = "/" + path.join("/");
  const body = await req.json().catch(() => ({}));

  if (route === "/auth/signup") {
    try {
      const user = createUser(String(body.name ?? ""), String(body.email ?? ""), String(body.password ?? ""));
      const token = createSession(user.id);
      return withSessionCookie(NextResponse.json(user, { status: 201 }), token);
    } catch (e) {
      return NextResponse.json(
        { detail: e instanceof Error ? e.message : String(e) },
        { status: 422 }
      );
    }
  }

  if (route === "/auth/login") {
    const user = authenticateUser(String(body.email ?? ""), String(body.password ?? ""));
    if (!user) {
      return NextResponse.json({ detail: "Incorrect email or password" }, { status: 401 });
    }
    const token = createSession(user.id);
    return withSessionCookie(NextResponse.json(user), token);
  }

  if (route === "/auth/logout") {
    const token = req.cookies.get(COOKIE)?.value;
    deleteSession(token);
    const res = new NextResponse(null, { status: 204 });
    res.cookies.set(COOKIE, "logged_out", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 86400,
    });
    return res;
  }

  if (route === "/auth/forgot") {
    startPasswordReset(String(body.email ?? ""));
    return NextResponse.json(
      { message: "If that email has an account, a reset link is on its way." },
      { status: 202 }
    );
  }

  if (route === "/auth/reset") {
    try {
      finishPasswordReset(String(body.token ?? ""), String(body.password ?? ""));
      return NextResponse.json({ message: "Password updated. Sign in with your new password." });
    } catch (e) {
      return NextResponse.json(
        { detail: e instanceof Error ? e.message : String(e) },
        { status: 422 }
      );
    }
  }

  if (route === "/me/password") {
    const { error, user } = requireUser(req);
    if (error) return error;
    try {
      changePassword(user.id, String(body.current_password ?? ""), String(body.new_password ?? ""));
      return new NextResponse(null, { status: 204 });
    } catch (e) {
      const status = (e as Error & { status?: number }).status ?? 422;
      return NextResponse.json(
        { detail: e instanceof Error ? e.message : String(e) },
        { status }
      );
    }
  }

  if (route === "/simulate") {
    const { error, user } = requireUser(req);
    if (error) return error;
    try {
      const origin: [number, number] = [Number(body.origin?.lat), Number(body.origin?.lng)];
      const destination: [number, number] = [Number(body.destination?.lat), Number(body.destination?.lng)];
      const closures: [number, number][] = Array.isArray(body.closures)
        ? body.closures.map((c: { lat: number; lng: number }) => [Number(c.lat), Number(c.lng)])
        : [];
      if (![...origin, ...destination].every(Number.isFinite)) {
        return NextResponse.json({ detail: "Origin and destination need numeric lat/lng" }, { status: 422 });
      }
      const originLabel = String(body.origin_label ?? "");
      const destinationLabel = String(body.destination_label ?? "");
      const params = {
        origin,
        destination,
        origin_label: originLabel,
        destination_label: destinationLabel,
        vehicles: Number(body.vehicles ?? 500),
        k_routes: Number(body.k_routes ?? 5),
        scenario: (body.scenario ?? "normal") as Scenario,
        closures,
      };
      const sim = runSimulation(params, await resolveCorridor(params));
      const tripId = saveTrip(user.id, [originLabel, destinationLabel], sim);
      return NextResponse.json({ ...sim, trip_id: tripId });
    } catch (e) {
      return NextResponse.json(
        { detail: e instanceof Error ? e.message : String(e) },
        { status: 422 }
      );
    }
  }

  return NextResponse.json({ detail: "Not found" }, { status: 404 });
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params;
  const route = "/" + path.join("/");
  if (route === "/me") {
    const { error, user } = requireUser(req);
    if (error) return error;
    const body = await req.json().catch(() => ({}));
    try {
      const updated = updateProfile(
        user.id,
        body.name,
        body.email,
        body.current_password
      );
      return NextResponse.json(updated);
    } catch (e) {
      const status = (e as Error & { status?: number }).status ?? 422;
      return NextResponse.json(
        { detail: e instanceof Error ? e.message : String(e) },
        { status }
      );
    }
  }
  return NextResponse.json({ detail: "Not found" }, { status: 404 });
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params;
  if (path[0] === "trips" && path.length === 2) {
    const { error, user } = requireUser(req);
    if (error) return error;
    const tripId = Number(path[1]);
    if (!deleteTripById(user.id, tripId)) {
      return NextResponse.json({ detail: "Trip not found" }, { status: 404 });
    }
    return new NextResponse(null, { status: 204 });
  }
  return NextResponse.json({ detail: "Not found" }, { status: 404 });
}
