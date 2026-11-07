import { Center, Loader } from "@mantine/core";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuthStatus } from "./api/auth";
import { AppLayout } from "./layout/AppLayout";
import { NAV } from "./layout/nav";
import { AuthPage } from "./pages/AuthPage";
import { NotFound } from "./pages/NotFound";

export function App() {
  const auth = useAuthStatus();

  if (auth.isPending) {
    return (
      <Center h="100%">
        <Loader />
      </Center>
    );
  }
  if (auth.data?.setupRequired) return <AuthPage mode="setup" />;
  if (!auth.data?.authenticated) return <AuthPage mode="login" />;

  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Navigate to={NAV[0]!.path} replace />} />
        {NAV.flatMap((item) => [
          ...(item.element ? [<Route key={item.path} path={item.path} element={item.element} />] : []),
          ...(item.children ?? []).map((c) => <Route key={c.path} path={c.path} element={c.element} />),
          ...(item.children?.length && !item.element
            ? [<Route key={item.path} path={item.path} element={<Navigate to={item.children[0]!.path} replace />} />]
            : []),
        ])}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppLayout>
  );
}
