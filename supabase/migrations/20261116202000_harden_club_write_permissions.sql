-- K-RE: Restrict direct club writes to trusted backend roles.
-- Preserve existing public read permissions and RLS policies.

revoke insert, update, delete, truncate, references, trigger
on table public.clubs
from public, anon, authenticated;

-- Remove any explicit column-level write grants.

do $$
declare
    col record;
begin
    for col in
        select column_name
        from information_schema.columns
        where table_schema = 'public'
        and table_name = 'clubs'
    loop
        execute format(
            'revoke insert (%1$I), update (%1$I), references (%1$I)
             on table public.clubs
             from public, anon, authenticated',
            col.column_name
        );
    end loop;
end;
$$;

-- Preserve trusted backend access.

grant select, insert, update, delete
on table public.clubs
to service_role;

-- Verify effective privileges.

do $$
declare
    role_name text;
    col record;
begin
    foreach role_name in array array['anon', 'authenticated']
    loop
        if has_table_privilege(
            role_name, 'public.clubs', 'DELETE'
        ) or has_table_privilege(
            role_name, 'public.clubs', 'TRUNCATE'
        ) then
            raise exception
                'Unexpected club write privilege: %', role_name;
        end if;

        for col in
            select column_name
            from information_schema.columns
            where table_schema = 'public'
            and table_name = 'clubs'
        loop
            if has_column_privilege(
                role_name, 'public.clubs',
                col.column_name, 'INSERT'
            ) or has_column_privilege(
                role_name, 'public.clubs',
                col.column_name, 'UPDATE'
            ) then
                raise exception
                    'Unexpected write privilege: % / %',
                    role_name, col.column_name;
            end if;
        end loop;
    end loop;
end;
$$;
