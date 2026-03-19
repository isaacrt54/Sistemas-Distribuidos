import java.rmi.Remote;
import java.rmi.RemoteException;

public interface VictoryService extends Remote {
    String generateVictoryCode(String playerName) throws RemoteException;
}