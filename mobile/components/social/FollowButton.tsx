import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import { Button } from '@/components/ui/Button';

interface Props {
  userId: string;
  isFollowing: boolean;
}

export function FollowButton({ userId, isFollowing }: Props) {
  const qc = useQueryClient();
  const toggle = useMutation({
    mutationFn: () =>
      isFollowing
        ? api.delete(ENDPOINTS.users.follow(userId))
        : api.post(ENDPOINTS.users.follow(userId)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user', userId] });
      qc.invalidateQueries({ queryKey: ['feed'] });
    },
  });

  return (
    <Button
      onPress={() => toggle.mutate()}
      variant={isFollowing ? 'outline' : 'primary'}
      size="sm"
      loading={toggle.isPending}
    >
      {isFollowing ? 'Following' : 'Follow'}
    </Button>
  );
}
