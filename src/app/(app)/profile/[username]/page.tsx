import { redirect } from 'next/navigation';

// Legacy route: /profile/{username} → canonical /user/{username}
export default function ProfileLegacyRedirect({ params }: { params: { username: string } }) {
  redirect(`/user/${params.username}`);
}
