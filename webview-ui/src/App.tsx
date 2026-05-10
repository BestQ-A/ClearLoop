import { RouterProvider } from "react-router-dom";
import { I18nProvider } from "./i18n/I18nContext";
import { router } from "./router";

function App() {
  return (
    <I18nProvider>
      <RouterProvider router={router} />
    </I18nProvider>
  );
}

export default App;
