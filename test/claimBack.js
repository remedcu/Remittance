const { BN, fromAscii, toWei } = web3.utils;

const remittance = artifacts.require("Remittance");

const truffleAssert = require('truffle-assertions');

const amount = new BN(toWei('1')); // <-- Change ETH value to be tested here
const hundred = new BN('100');
const time = 3600 // Around an hour
const shortTime = 1 // Just a second
const twoEtherInWei = new BN(toWei("2"));
const bobSecretBytes = fromAscii("bobSecret");
const fakeSecretBytes = fromAscii("secret");

function wait(seconds) {
  return new Promise((resolve, reject) => setTimeout(resolve, seconds));
}

contract('Remittance', (accounts) => {

  let remittanceInstance;
  let owner, alice, bob, carol;
  let bobCarolHash;

  before("Preparing Accounts and Initial Checks", async function() {
    assert.isAtLeast(accounts.length, 4, "Atleast four accounts required");

    // Setup 4 accounts.
    [owner, alice, bob, carol] = accounts;

    //Checking if all accounts have atleast 2 ETH or more for test
    assert.isTrue((new BN(await web3.eth.getBalance(owner))).gt(twoEtherInWei), "Owner Account has less than 2 ETH");
    assert.isTrue((new BN(await web3.eth.getBalance(alice))).gt(twoEtherInWei), "Alice Account has less than 2 ETH");
    assert.isTrue((new BN(await web3.eth.getBalance(bob))).gt(twoEtherInWei), "Bob Account has less than 2 ETH");
    assert.isTrue((new BN(await web3.eth.getBalance(carol))).gt(twoEtherInWei), "Carol Account has less than 2 ETH");

  })

  beforeEach("Creating New Instance", async function() {
    remittanceInstance = await remittance.new({ from: owner});

    // Get the hashValue first
    bobCarolHash = await remittanceInstance.encrypt(bobSecretBytes, carol, {from: alice});
  });

  describe("Function: claimBack", function() {

    describe("Basic Working", function() {
      it('Should claim back the amount correctly', async () => {
        // Make transaction from alice account to remit function.
        await remittanceInstance.remit(bobCarolHash, shortTime, {from: alice, value: amount});
    
        // To wait atleast 2 seconds before executing this to force the start of claim period
        await wait(2000);
    
        // Get initial balance of Alice before the transaction is made.
        const startingBalanceOfAlice = new BN(await web3.eth.getBalance(alice));
    
        // Claim Back amount from Bob
        const txReceiptOfClaimBack = await remittanceInstance.claimBack(bobCarolHash, {from: alice});
        const gasUsedInClaimBack = new BN(txReceiptOfClaimBack.receipt.gasUsed);
        const gasPriceInClaimBack = new BN((await web3.eth.getTransaction(txReceiptOfClaimBack.tx)).gasPrice);
    
        // Get final balance of Alice before the transaction is made.
        const endingBalanceOfAlice = new BN(await web3.eth.getBalance(alice));
    
        const total = startingBalanceOfAlice.add(amount).sub(hundred).sub(gasUsedInClaimBack.mul(gasPriceInClaimBack));
    
        // Check if the result is correct or not
        assert.strictEqual(endingBalanceOfAlice.toString(10),total.toString(10), "Amount wasn't correctly received by Alice");
    
      });
    });

    describe("Edge Cases", function() {
      it('Should only allow to claim back if the deadline is passed', async () => {
        await remittanceInstance.remit(bobCarolHash, time, {from: alice, value: amount});
        await truffleAssert.fails(
          remittanceInstance.claimBack(bobCarolHash, {from: alice}),
          null,
          'Claim Period has not started yet'
        );
      });
    
      it('Should only allow to claim back if the exchange is not done yet', async () => {
        await remittanceInstance.remit(bobCarolHash, shortTime, {from: alice, value: amount});
        await remittanceInstance.exchange(bobSecretBytes, {from: carol});
        await truffleAssert.fails(
          remittanceInstance.claimBack(bobCarolHash, {from: alice}),
          null,
          'Exchange is already complete'
        );
      });
        
      it('Should only allow Alice to claim back from Bob through secret keys', async () => {
        await remittanceInstance.remit(bobCarolHash, shortTime, {from: alice, value: amount});
        await truffleAssert.fails(
          remittanceInstance.claimBack(bobCarolHash, {from: owner}),
          null,
          'Only Remit Creator can claim back'
        );
      });
    
      it('Should only allow if Hash Value is Correct', async () => {
        await remittanceInstance.remit(bobCarolHash, shortTime, {from: alice, value: amount});
        fakeSecret = await remittanceInstance.encrypt(fakeSecretBytes, carol, {from: alice});
        await truffleAssert.fails(
          remittanceInstance.claimBack(fakeSecret, {from: alice}),
          null,
          // This is because as the hashValue is new, the Remit Creator address is checked initially which is set to default value 0x0
          'Only Remit Creator can claim back'
        );
      });
    });
    
    describe("Input Cases", function() {
      it('Should only work if hashValue is given', async () => {
        await remittanceInstance.remit(bobCarolHash, time, {from: alice, value: amount});
        await truffleAssert.fails(
          remittanceInstance.claimBack({from: alice}),
          null,
          'invalid bytes32 value'
        );
      });
    });
    
    describe("Event Cases", function() {
      it("Should correctly emit the proper event: ClaimBack", async () => {
        const remitReceipt = await remittanceInstance.remit(bobCarolHash, shortTime, {from: alice, value: hundred});
        await wait(2000);
        const claimBackReceipt = await remittanceInstance.claimBack(bobCarolHash, {from: alice});

        assert.strictEqual(claimBackReceipt.logs.length, 1);
        const log = claimBackReceipt.logs[0];
        const remittanceAddress = remitReceipt.logs[0].address;
    
        assert.strictEqual(log.event, "ClaimBack");
        assert.strictEqual(log.address, remittanceAddress);
        assert.strictEqual(log.args.hashValue, bobCarolHash);
        assert.strictEqual(log.args.remitCreator, alice);
        assert.strictEqual(log.args.value.toString(10),hundred.toString(10));
      });
    });
    
  });

});