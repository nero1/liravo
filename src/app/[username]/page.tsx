import { redirect } from 'next/navigation';

// Legacy route: /{username} → canonical /user/{username}
export default function LegacyProfileRedirect({ params }: { params: { username: string } }) {
  redirect(`/user/${params.username}`);
}
