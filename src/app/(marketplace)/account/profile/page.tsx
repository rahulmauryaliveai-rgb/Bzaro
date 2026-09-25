import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireBuyerPage } from "@/lib/buyer/guard";
import { AccountShell } from "@/components/account/AccountShell";
import {
  DeleteAccountCard,
  DetailsForm,
  PasswordCard,
  PhoneForm,
} from "@/components/account/ProfileForms";
import { getBuyerProfile } from "@/server/services/buyer-account.service";
import { getAllCities } from "@/server/services/taxonomy.service";

export const metadata: Metadata = {
  title: "Profile & settings",
  robots: { index: false, follow: false },
};

/**
 * Everything the Privacy Policy promises a buyer can do themselves: see and
 * correct their data, choose alerts, delete the account.
 */
export default async function ProfilePage() {
  const user = await requireBuyerPage("/account/profile");
  const [profile, cities] = await Promise.all([getBuyerProfile(user.id), getAllCities()]);
  if (!profile) notFound();

  const googleLinked = profile.accounts.some((account) => account.provider === "google");

  return (
    <AccountShell userId={user.id} active="profile">
      <h1 className="text-2xl font-semibold tracking-tight">Profile &amp; settings</h1>
      <p className="mt-1 text-sm text-neutral-600">
        Suppliers see your name and, once they accept a requirement, your number.
      </p>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-5">
          <div className="rounded-lg border border-neutral-200 bg-white p-5">
            <p className="text-xs text-neutral-500">Email</p>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm font-medium break-all">
              {profile.email}
              {googleLinked ? (
                <span className="bg-brand-50 text-brand-800 rounded-full px-2 py-0.5 text-xs font-semibold">
                  Google linked
                </span>
              ) : null}
            </p>
          </div>
          <DetailsForm
            name={profile.name ?? ""}
            locationId={profile.buyerProfile?.locationId ?? ""}
            notifyOnResponse={profile.buyerProfile?.notifyOnResponse ?? true}
            cities={cities.map((city) => ({ id: city.id, name: city.name }))}
          />
          <PhoneForm phone={profile.phone} />
        </div>
        <div className="space-y-5">
          <PasswordCard email={profile.email} hasPassword={profile.passwordHash !== null} />
          {profile.role === "BUYER" ? (
            <DeleteAccountCard />
          ) : (
            <div className="rounded-lg border border-neutral-200 bg-white p-5 text-sm text-neutral-600">
              This account also manages a business on Bzaro. To close it, email us from the address
              above.
            </div>
          )}
        </div>
      </div>
    </AccountShell>
  );
}
