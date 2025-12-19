import { Switch, Route, useLocation, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme";
import { AuthProvider, useAuth } from "@/lib/auth";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import About from "@/pages/about";
import HowItWorks from "@/pages/how-it-works";
import Terms from "@/pages/terms";
import Contact from "@/pages/contact";
import Login from "@/pages/auth/login";
import SignupPatient from "@/pages/auth/signup-patient";
import SignupDoctor from "@/pages/auth/signup-doctor";
import ForgotPassword from "@/pages/auth/forgot-password";
import ResetPassword from "@/pages/auth/reset-password";
import VerifyEmail from "@/pages/auth/verify-email";
import PatientDashboard from "@/pages/dashboard/patient";
import DoctorDashboard from "@/pages/dashboard/doctor";
import LinkPage from "@/pages/link";
import PatientPage from "@/pages/patient";
import DoctorPage from "@/pages/doctor";
import { Loader2 } from "lucide-react";

function ProtectedRoute({ 
  children, 
  allowedRole 
}: { 
  children: React.ReactNode;
  allowedRole?: "PATIENT" | "DOCTOR";
}) {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to={`/login?redirect=${encodeURIComponent(location)}`} />;
  }

  if (allowedRole && user.role !== allowedRole) {
    return <Redirect to={user.role === "PATIENT" ? "/dashboard/patient" : "/dashboard/doctor"} />;
  }

  return <>{children}</>;
}

function AuthRedirect({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user) {
    return <Redirect to={user.role === "PATIENT" ? "/dashboard/patient" : "/dashboard/doctor"} />;
  }

  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/">
        <AuthRedirect>
          <Landing />
        </AuthRedirect>
      </Route>
      
      <Route path="/login">
        <AuthRedirect>
          <Login />
        </AuthRedirect>
      </Route>
      
      <Route path="/signup/patient">
        <AuthRedirect>
          <SignupPatient />
        </AuthRedirect>
      </Route>
      
      <Route path="/signup/doctor">
        <AuthRedirect>
          <SignupDoctor />
        </AuthRedirect>
      </Route>
      
      <Route path="/forgot-password">
        <ForgotPassword />
      </Route>
      
      <Route path="/reset-password">
        <ResetPassword />
      </Route>
      
      <Route path="/verify-email">
        <VerifyEmail />
      </Route>
      
      <Route path="/patient">
        <PatientPage />
      </Route>
      
      <Route path="/doctor">
        <DoctorPage />
      </Route>
      
      <Route path="/about">
        <About />
      </Route>
      
      <Route path="/how-it-works">
        <HowItWorks />
      </Route>
      
      <Route path="/terms">
        <Terms />
      </Route>
      
      <Route path="/contact">
        <Contact />
      </Route>
      
      <Route path="/dashboard/patient">
        <ProtectedRoute allowedRole="PATIENT">
          <PatientDashboard />
        </ProtectedRoute>
      </Route>
      
      <Route path="/dashboard/doctor">
        <ProtectedRoute allowedRole="DOCTOR">
          <DoctorDashboard />
        </ProtectedRoute>
      </Route>
      
      <Route path="/link/:token">
        <LinkPage />
      </Route>
      
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
