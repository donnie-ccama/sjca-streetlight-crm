import { FieldActorSource } from 'twenty-shared/types';

import { type ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { CreateCompanyAndPersonService } from 'src/modules/contact-creation-manager/services/create-company-and-contact.service';

const connectedAccount = {
  id: 'connected-account-id',
  provider: 'google',
} as unknown as ConnectedAccountEntity;

const workDomainContact = {
  handle: 'pat@example-nonprofit.org',
  displayName: 'Pat Example',
};

const buildService = () =>
  new CreateCompanyAndPersonService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

describe('CreateCompanyAndPersonService', () => {
  describe('computeContactsThatNeedPersonCreateAndRestoreAndWorkDomainNamesToCreate', () => {
    it.each([FieldActorSource.EMAIL, FieldActorSource.CALENDAR])(
      'skips companies when isCompanyAutoCreationEnabled is false for %s source',
      (source) => {
        const result =
          buildService().computeContactsThatNeedPersonCreateAndRestoreAndWorkDomainNamesToCreate(
            [workDomainContact],
            [],
            source,
            connectedAccount,
            null,
            false,
          );

        expect(result.workDomainNamesToCreate).toEqual([]);
        expect(result.contactsThatNeedPersonCreate).toEqual([
          workDomainContact,
        ]);
      },
    );

    it('creates the work domain company when isCompanyAutoCreationEnabled is true', () => {
      const result =
        buildService().computeContactsThatNeedPersonCreateAndRestoreAndWorkDomainNamesToCreate(
          [workDomainContact],
          [],
          FieldActorSource.EMAIL,
          connectedAccount,
          null,
          true,
        );

      expect(result.workDomainNamesToCreate).toHaveLength(1);
      expect(result.workDomainNamesToCreate[0].domainName).toBe(
        'example-nonprofit.org',
      );
    });
  });
});
