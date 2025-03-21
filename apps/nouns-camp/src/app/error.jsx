"use client";

import React from "react";
import { reportError } from "@/utils/monitoring";
import ClientAppProvider from "@/app/client-app-provider";
import ErrorScreen from "@/components/error-screen";

export default function Error({
  error,
  // reset
}) {
  React.useEffect(() => {
    reportError(error);
  }, [error]);

  return (
    <ClientAppProvider>
      <ErrorScreen
        title="Camp broke!"
        description="Garbage software..."
        imageSrc="https://media1.tenor.com/m/2TE2ws3_4z8AAAAC/nouns-dao.gif"
        linkHref="/"
        linkLabel="Back to safety"
        error={error}
      />
    </ClientAppProvider>
  );
}
